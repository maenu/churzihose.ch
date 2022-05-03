const http = require('http')
const https = require('https')
const fs = require('fs')
const url = require('url')
const {Client} = require('pg')
const Handlebars = require('handlebars')
const {JSDOM} = require('jsdom')
const {parse} = require('csv-parse/sync')

const MODEL = parse(fs.readFileSync('models.csv').toString('utf8'), {
  columns: true
}).map(e => {
	return {
		light: e.light === '1',
		cloud: parseInt(e.cloud),
		rain: parseInt(e.rain),
		snow: parseInt(e.snow),
		lightning: parseInt(e.lightning),
		fog: parseInt(e.fog)
	}
})
Handlebars.registerHelper('json', (context) => JSON.stringify(context))
const HTML = Handlebars.compile(fs.readFileSync('index.html').toString('utf8'))
const DAY = 24 * 60 * 60 * 1000
const TWO_PI_DAY = 2 * Math.PI / DAY

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

const light = (sunrise, sunset, x) => Math.sin(TWO_PI_DAY * (sunrise - sunset)) - Math.sin(TWO_PI_DAY * (x - sunset))
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
	const start = weather.graph.start
	const sunrise = weather.graph.sunrise[0]
	const sunset = weather.graph.sunset[0]
	const day = Math.sin(TWO_PI_DAY * (sunrise - sunset))
	const now = Date.now()
	const amplitude = light(sunrise, sunset, now)
	const models = weather.graph.weatherIcon3h.slice(0, 8).map((n, i) => MODEL[n % 100 - 1])
	const lightness = []
	for (let i = 0; i <= 8; i = i + 1) {
		lightness.push({
			x: 100 * i / 8,
			y: 25 + 50 * (light(sunrise, sunset, start + i / 8 * DAY) - day + 1) / 2
		})
	}
	const winds = points(weather.graph.windSpeed3h.slice(0, 8), 120)
	const rains = points(weather.graph.precipitation10m, 50)
	const temperatures = points(weather.graph.temperatureMean1h.slice(0, 24), 40)
	return {
		models: models,
		original: weather,
		lightness: lightness,
		sunrise: 100 * (sunrise - start) / DAY,
		sunset: 100 * (sunset - start) / DAY,
		light: {
			x: 100 * (now - start) / DAY,
			y: 50 - 50 * (amplitude < 0 ? -amplitude / (1 - day) : amplitude / (1 + day)),
			class: amplitude < 0 ? 'moon' : 'sun'
		},
		layers: [{
			class: 'wind',
			domain: [0, 120],
			unit: 'km/h',
			min: min(winds),
			max: max(winds),
			d: d(winds, 0.5)
		}, {
			class: 'rain',
			domain: [0, 50],
			unit: 'mm/h',
			min: min(rains),
			max: max(rains),
			d: d(rains, 0.2)
		}, {
			class: 'temperature',
			domain: [0, 40],
			unit: '°C',
			min: min(temperatures),
			max: max(temperatures),
			d: d(temperatures, 0)
		}].sort((a, b) => b.max.v / b.domain[1] - a.max.v / a.domain[1])
	}
}
const getMessage = (weather) => {
	const temparature = weather.layers.filter(l => l.class === 'temperature')[0].max.v
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

const add = (p, q) => {
	return {
		x: p.x + q.x,
		y: p.y + q.y
	}
}
const subtract = (p, q) => {
	return {
		x: p.x - q.x,
		y: p.y - q.y
	}
}
const multiply = (p, a) => {
	return {
		x: a * p.x,
		y: a * p.y
	}
}
const abs = (p) => Math.sqrt(Math.pow(p.x, 2) + Math.pow(p.y, 2))
const dot = (p, q) => p.x * q.x + p.y * q.y
const cos = (p, q) => dot(p, q) / (abs(p) * abs(q))
const unit = (p) => {
	let d = abs(p)
	if (d === 0) {
		return {
			x: 0,
			y: 0
		}
	} else {
		return multiply(p, 1 / d)
	}
}
const start = (points, i, d = 1) => {
	let pp = points[Math.min(Math.max(i - 1, 0), points.length - 1)]
	let p = points[Math.min(Math.max(i, 0), points.length - 1)]
	let pn = points[Math.min(Math.max(i + 1, 0), points.length - 1)]
	let q = unit(subtract(pn, pp))
	let c = abs(subtract(pn, p))
	return add(p, multiply(q, d * c))
}
const end = (points, i, d = 1) => {
	let pp = points[Math.min(Math.max(i - 1, 0), points.length - 1)]
	let p = points[Math.min(Math.max(i, 0), points.length - 1)]
	let pn = points[Math.min(Math.max(i + 1, 0), points.length - 1)]
	let q = unit(subtract(pp, pn))
	let c = abs(subtract(pp, p))
	return add(p, multiply(q, d * c))
}
const d = (points, smoothing = 0.5) => {
	let d = `L ${points[0].x} ${points[0].y}`
	for (let i = 1; i < points.length; i = i + 1) {
		let pp = points[Math.min(Math.max(i - 1, 0), points.length - 1)]
		let p = points[i]
		let ps = start(points, i - 1, smoothing)
		let pe = end(points, i, smoothing)
		d = `${d} C ${ps.x} ${ps.y},  ${pe.x} ${pe.y}, ${p.x} ${p.y}`
	}
	return d
}
const points = (vs, h) => {
	vs = vs.map((v, i) => point(v, i, h, vs.length))
	vs.unshift({
		x: 0,
		y: (3 * vs[0].y - vs[1].y) / 2
	})
	vs.push({
		x: 100,
		y: (3 * vs[vs.length - 1].y - vs[vs.length - 2].y) / 2
	})
	return vs
}
const point = (v, i, h, d) => {
	return {
		v: v,
		x: i * 100 / d + 100 / (2 * d),
		y: 100 - v * 100 / h
	}
}
const min = (ps) => ps.filter(p => p.hasOwnProperty('v')).reduce((a, b) => a.v < b.v ? a : b)
const max = (ps) => ps.filter(p => p.hasOwnProperty('v')).reduce((a, b) => a.v > b.v ? a : b)

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
