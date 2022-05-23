const http = require('http')
const https = require('https')
const fs = require('fs')
const url = require('url')
const {Client} = require('pg')
const Handlebars = require('handlebars')
const {JSDOM} = require('jsdom')
const {parse} = require('csv-parse/sync')

Handlebars.registerHelper('json', (context) => JSON.stringify(context))

const MODEL = parse(fs.readFileSync('models.csv').toString('utf8'), { columns: true }).map(e => {
	return {
		light: e.light === '1',
		cloud: parseInt(e.cloud),
		rain: parseInt(e.rain),
		snow: parseInt(e.snow),
		lightning: parseInt(e.lightning),
		fog: parseInt(e.fog)
	}
})
const HTML = Handlebars.compile(fs.readFileSync('index.html').toString('utf8'))
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const responsify = response => new Promise((resolve, reject) => {
	let chunks = []
	response.on('data', chunk => chunks.push(chunk))
	response.on('end', () => {
		let data = Buffer.concat(chunks).toString()
		if (response.statusCode < 400) {
			resolve(data, response)
		} else {
			reject(data, response)
		}
	})
})
const json = options => new Promise((resolve, reject) => {
	https.request(options, response => {
		responsify(response).then(data => resolve(JSON.parse(data), response), reject)
	}).end()
})
const dom = options => new Promise((resolve, reject) => {
	https.request(options, response => {
		responsify(response).then(data => resolve(new JSDOM(data), response), reject)
	}).end()
})
const points = (values, interval, start = 0) => {
	return values.map((value, i) => {
		return {
			x: start + (i + 0.5) * interval,
			y: value
		}
	})
}
const extrema = (points) => {
	const days = []
	for (const point of points) {
		const day = Math.floor(point.x / (60 * 24))
		if (day === days.length) {
			days.push([point, point])
		} else {
			if (point.y < days[day][0].y) {
				days[day][0] = point
			}
			if (point.y > days[day][1].y) {
				days[day][1] = point
			}
		}
	}
	return days.flat()
}

const getAare = async () => {
	const schoenau = await dom({
		method: 'GET',
		hostname: 'www.hydrodaten.admin.ch',
		path: '/de/2135.html'
	})
	const data = Array.from(schoenau.window.document.querySelector('table').querySelectorAll('tbody tr:first-child td')).map(e => parseFloat(e.textContent))
	return {
		abfluss: data[0],
		wasserstand: data[1],
		temperatur: data[2]
	}
}
const getLocation = async (longitude, latitude) => {
	const client = new Client({
		host: '/tmp',
		database: 'plz',
		user: 'postgres'
	})
	await client.connect()
	const result = await client.query(`select kurztext, plz
		from ortschaft
			join ortschaftsname on (ortschaftsname.ortschaftsname_von = ortschaft.t_id)
			join plz6 on (plz6.plz6_von = ortschaft.t_id)
		where st_contains(plz6.flaeche, st_transform(st_geomfromtext('POINT('||$1||' '||$2||')', 4326), 21781))`, [
		longitude, latitude
	])
	await client.end()
	if (result.rows.length === 0) {
		return null
	}
	return result.rows[0]
}
const getWeather = async plz => {
	const weather = await json({
		method: 'GET',
		hostname: 'app-prod-ws.meteoswiss-app.ch',
		path: `/v1/plzDetail?plz=${plz}00`
	})
	const graph = weather.graph
	const models = graph.weatherIcon3h.map((n, i) => MODEL[n % 100 - 1])
	const winds = points(graph.windSpeed3h, 3 * 60)
	const wets = points(graph.precipitation10m, 10).concat(points(graph.precipitation1h, 60, (graph.startLowResolution - graph.start) / MINUTE))
	const temperatures = points(graph.temperatureMean1h, 60)
	return {
		domain: [0, temperatures[temperatures.length - 1].x + 30],
		sun: graph.sunrise.map((e, i) => [(e - graph.start) / MINUTE, (graph.sunset[i] - graph.start) / MINUTE]),
		models: models,
		values: {
			temperature: {
				range: [0, 40],
				unit: '°C',
				extrema: extrema(temperatures),
				points: temperatures,
				smoothing: 0
			},
			wind: {
				range: [0, 120],
				unit: 'km/h',
				extrema: extrema(winds),
				points: winds,
				smoothing: 0.5
			},
			wet: {
				range: [0, 50],
				unit: 'mm/h',
				extrema: extrema(wets),
				points: wets,
				smoothing: 0.5
			}
		}
	}
}
const getMessage = (weather) => {
	const temparature = weather.values.temperature.extrema[1].y
	if (temparature >= 25) {
		return 'unbedingt!'
	}
	if (temparature >= 22) {
		return 'ja eh!'
	}
	if (temparature >= 20) {
		return 'chame'
	}
	if (temparature >= 17) {
		return 'wedä meinsch...'
	}
	if (temparature >= 15) {
		return 'würd nid'
	}
	return 'schpinsch?'
}
const getData = async (longitude, latitude) => {
	const location = await getLocation(longitude, latitude)
	const weather = await getWeather(location.plz)
	return {
		message: getMessage(weather),
		location: location,
		weather: weather,
		aare: await getAare()
	}
}

const server = https.createServer({
			key: fs.readFileSync('privkey.pem'),
			cert: fs.readFileSync('cert.pem'),
			ca: fs.readFileSync('chain.pem')
		}, (request, response) => {
	if (['/manifest.json', '/icon-192.png', '/icon-512.png'].indexOf(request.url) >= 0) {
		let p = request.url.substring(1)
		response.writeHead(200, {
			'Content-Type': p.endsWith('.json') ? 'application/json' : 'image/png',
			'Content-Length': fs.statSync(p).size
		})
		fs.createReadStream(p).pipe(response)
		return
	}
	if (request.url === '/') {
		response.statusCode = 200
		response.end(HTML({ message: 'wart hurti...' }))
		return
	}
	if (!request.url.startsWith('/location')) {
		response.statusCode = 404
		response.end(HTML({ message: 'das gits nid'}))
		return
	}
	let u = new url.URL('http://' + request.headers['host'] + request.url)
	let longitude = parseFloat(u.searchParams.get('longitude'))
	let latitude = parseFloat(u.searchParams.get('latitude'))
	if (isNaN(longitude) || isNaN(latitude)) {
		response.statusCode = 404
		response.end(HTML({ message: 'das gits nid'}))
		return
	}
	getData(longitude, latitude).then(data => {
		response.statusCode = 200
		response.end(HTML(data))
	}, error => {
		console.error(error)
		response.statusCode = 500
		response.end(HTML({ message: 'ke ahnig' }))
	})
})
server.listen(443)

let timeout = null
fs.watch('cert.pem', () => {
	clearTimeout(timeout)
	timeout = setTimeout(() => {
		server.setSecureContext({
			key: fs.readFileSync('privkey.pem'),
			cert: fs.readFileSync('cert.pem'),
			ca: fs.readFileSync('chain.pem')
		})
	}, 1000)
})

http.createServer((request, response) => {
	response.statusCode = 301
	response.setHeader('location', `https://${request.headers.host}${request.url}`)
	response.end()
}).listen(80)
