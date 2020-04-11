const http = require('http')
const https = require('https')

const PORT = process.env.PORT
const CH_IP = process.env.CH_IP
const CH_ID = process.env.CH_ID
const CH_SECRET = process.env.CH_SECRET
const HTML = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>churzi hose?</title>
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
		}
		body > p {
			position: absolute;
			top: 0;
			left: 0;
  			font-size: 3vh;
  			color: rgba(0, 0, 0, 0.5);
		}
		div {
			display: grid;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
		}
		div > p {
			margin: auto;
  			font-size: 15vh;
  			color: rgba(0, 0, 0, 0.5);
		}
	</style>
</head>
<body>
	<p>{3} {4}°C {5}%</p>
	<svg width="100vw" height="100vh" stroke="none" fill="none" viewBox="0 0 100 100" preserveAspectRatio="none">
		<path d="{2}" fill="rgba(0, 127, 253, 0.5)"></path>
		<path d="{1}" fill="rgba(253, 127, 0, 0.5)"></path>
	</svg>
	<div>
		<p>{0}</p>
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
const json = (options) => new Promise((resolve, reject) => {
	https.request(options, response => {
		let chunks = []
		response.on('data', chunk => chunks.push(chunk))
		response.on('end', () => {
			if (response.statusCode < 400) {
				resolve(JSON.parse(Buffer.concat(chunks).toString()), response)
			} else {
				reject(response)
			}
		})
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
const getLocation = (ip) => json({
	method: 'GET',
	hostname: 'api.ipgeolocationapi.com',
	path: `/geolocate/${ip}`
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
const normalize = (a, h) => a.map((y, i) => {
	return {
		x: i * 100 / 8,
		y: 100 - y * 100 / h
	}
})

http.createServer((request, response) => {
	let ip = CH_IP || request.headers['x-forwarded-for'] || request.connection.remoteAddress
	Promise.all([
		getLocation(ip),
		getWeatherAuthentication(CH_ID, CH_SECRET)
	])
		.then(([location, authentication]) => getWeatherForecast(location.geo.latitude, location.geo.longitude, authentication.access_token))
		.then(forecast => {
			let location = forecast.info.name.de
			let temperatures = forecast['24hours'].map(d => parseFloat(d.values[1].ttt))
			let rains = forecast['24hours'].map(d => parseFloat(d.values[6].pr3))
			let temperature = Math.max.apply(null, temperatures)
			let rain = Math.max.apply(null, rains)
			let message = getMessage(temperature, rain)
			let dTemperature = `M 0 100 ${d(normalize(temperatures, 50))} L 100 100`
			let dRain = `M 0 100 ${d(normalize(rains, 100))} L 100 100`
			response.statusCode = 200
			response.end(HTML.format(message, dTemperature, dRain, location, temperature, rain))
		}, error => {
			response.statusCode = 500
			response.end(HTML.format('ke ahnig'))
		})
}).listen(PORT)
