const http = require('http')
const https = require('https')
const fs = require('fs')
const url = require('url')

const PORT = process.env.PORT
const CH_ID = process.env.CH_ID
const CH_SECRET = process.env.CH_SECRET
const HTML = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="apple-mobile-web-app-capable" content="yes">
	<meta name="mobile-web-app-capable" content="yes">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>churzi hose?</title>
	<link rel="manifest" href="/manifest.json">
	<link rel="shortcut icon" type="image/x-icon" href="/icon-512.png" />
	<link rel="icon" type="image/x-icon" href="/icon-512.png" />
	<style>
		*, *::before, *::after {
  			box-sizing: border-box;
  			margin: 0;
  			padding: 0;
		}
		html, body {
			width: 100%;
			height: 100%;
  			font-family: Helvetica, Arial, sans-serif;
  			color: rgba(0, 127, 255, 0.5);
		}
		.overlay {
			display: grid;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			cursor: pointer;
		}
		.overlay > p {
			margin: 3em auto auto auto;
			user-select: none;
			padding-bottom: 3em;
			text-align: center;
		}
		.message {
  			font-size: 2em;
		}
		.label {
  			position: absolute;
  			padding: 0.25em;
		}
		.temperature {
			right: 0;
  			color: rgba(0, 127, 255, 0.5);
		}
		.rain {
			left: 0;
  			color: rgba(255, 127, 0, 0.5);
		}
		.min {
			bottom: 0;
		}
		.max {
			top: 0;
		}
		.time {
  			position: absolute;
  			top: 0;
  			left: 0;
  			width: 100%;
  			height: 100%;
    		background-blend-mode: multiply;
  			background: rgba(255, 255, 2555, 0.25);
		}
	</style>
	<script>
		const load = () => {
			document.querySelector('.message').innerHTML = 'wart hurti...'
			navigator.geolocation.getCurrentPosition(e => {
				window.location.href = '/location?latitude=' + e.coords.latitude + '&longitude=' + e.coords.longitude
			}, e => {
				document.querySelector('.message').innerHTML = 'aktivier doch ortigdienscht ide ischtellige du möff, süsch chani o nüt mache: einstellungen > datenschutz > ortungsdienste > safari'
			})
		}
		document.addEventListener('DOMContentLoaded', () => {
			if (window.location.pathname !== '/location') {
				document.querySelectorAll('.meta, .label, .time, svg').forEach(e => e.style.display = 'none')
			} else {
				let now = new Date()
				document.querySelector('.clock').innerHTML = now.toLocaleTimeString()
				document.querySelector('.time').style.width = '' + 100 * (now.getHours() * 60 + now.getMinutes()) / (24 * 60) + '%'
			}
			document.querySelector('.overlay').addEventListener('click', load)
			document.querySelector('.overlay').addEventListener('touchend', load)
			if (window.location.pathname === '/') {
				load()
			}
		})
	</script>
</head>
<body>
	<svg width="100vw" height="100vh" stroke="none" fill="none" viewBox="0 0 100 100" preserveAspectRatio="none">
		<path d="{1}" fill="rgba(255, 127, 0, 0.5)"></path>
		<path d="{2}" fill="rgba(0, 127, 255, 0.5)"></path>
	</svg>
	<div class="time"></div>
	<p class="label temperature min">0°C</p>
	<p class="label temperature max">40°C</p>
	<p class="label rain min">0%</p>
	<p class="label rain max">100%</p>
	<div class="overlay">
		<p>
			<span class="message">{0}</span>
			<span class="meta">
				<br>
				<br>
				<span class="clock"></span>
				<br>
				{3}
				<br>
				<br>
				max {4}°C
				<br>
				max {5}% räge
			</span>
		</p>
	</div>
</body>
</html>`

String.prototype.format = function () {
	let formatted = this
	for (let i = 0; i < arguments.length; i = i + 1) {
		let regexp = new RegExp(`\\{${i}\\}`, 'gi')
		formatted = formatted.replace(regexp, arguments[i])
	}
	return formatted
}

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
const getWeatherAuthentication = (id, secret) => json({
	method: 'POST',
	hostname: 'api.srgssr.ch',
	path: '/oauth/v1/accesstoken?grant_type=client_credentials',
	headers: {
		Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
	}
})
const getWeatherForecast = (latitude, longitude, token) => json({
	method: 'GET',
	hostname: 'api.srgssr.ch',
	path: `/forecasts/v1.0/weather/24hour?latitude=${latitude}&longitude=${longitude}`,
	headers: {
		Authorization: `Bearer ${token}`
	}
})
const getMessage = (temperature, rain) => {
	if (temperature >= 25) {
		return 'unbedingt!'
	}
	if (temperature >= 22) {
		return 'ja eh!'
	}
	if (temperature >= 20) {
		return 'chame'
	}
	if (temperature >= 17) {
		return 'wedä meinsch...'
	}
	if (temperature >= 15) {
		return 'würd nid'
	}
	return 'schpinsch?'
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
const normalize = (a, h) => {
	a = a.map((y, i) => {
		return {
			x: i * 100 / 8 + 100 / 16,
			y: 100 - y * 100 / h
		}
	})
	a.unshift({
		x: 0,
		y: (3 * a[0].y - a[1].y) / 2
	})
	a.push({
		x: 100,
		y: (3 * a[a.length - 1].y - a[a.length - 2].y) / 2
	})
	return a
}

http.createServer((request, response) => {
	if (request.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV !== 'development') {
		response.writeHead(301, {
			'Location': 'https://' + request.headers['host'] + request.url
		})
		response.end()
		return
	}
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
		response.end(HTML.format('wart hurti...'))
		return
	}
	if (!request.url.startsWith('/location')) {
		response.statusCode = 404
		response.end(HTML.format('das gits nid'))
		return
	}
	let u = new url.URL('http://' + request.headers['host'] + request.url)
	let latitude = parseFloat(u.searchParams.get('latitude'))
	let longitude = parseFloat(u.searchParams.get('longitude'))
	if (isNaN(latitude) || isNaN(longitude)) {
		response.statusCode = 404
		response.end(HTML.format('das gits nid'))
		return
	}
	getWeatherAuthentication(CH_ID, CH_SECRET)
		.then(authentication => getWeatherForecast(latitude, longitude, authentication.access_token))
		.then(forecast => {
			let location = forecast.info.name.de
			let temperatures = forecast['24hours'].map(d => parseFloat(d.values[1].ttt))
			let rains = forecast['24hours'].map(d => parseFloat(d.values[6].pr3))
			let temperature = Math.max.apply(null, temperatures)
			let rain = Math.max.apply(null, rains)
			let message = getMessage(temperature, rain)
			let dTemperature = `M 0 100 ${d(normalize(temperatures, 40))} L 100 100`
			let dRain = `M 0 100 ${d(normalize(rains, 100))} L 100 100`
			response.statusCode = 200
			response.end(HTML.format(message, dRain, dTemperature, location, temperature, rain))
		}, data => {
			response.statusCode = 500
			response.end(HTML.format('ke ahnig'))
		})
}).listen(PORT)
