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
			display: grid;
			background: #007FFD;
		}
		p {
			margin: auto;
  			text-align: center;
  			font-family: Helvetica, Arial, sans-serif;
  			font-size: 20vw;
			padding: 0.5em;
  			color: white;
		}
	</style>
</head>
<body>
	<p>{0}</p>
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

http.createServer((request, response) => {
	let ip = CH_IP || request.headers['x-forwarded-for'] || request.connection.remoteAddress
	Promise.all([
		getLocation(ip),
		getWeatherAuthentication(CH_ID, CH_SECRET)
	])
		.then(([location, authentication]) => getWeatherForecast(location.geo.latitude, location.geo.longitude, authentication.access_token))
		.then(forecast => {
			let temperature = Math.max.apply(null, forecast['24hours'].map(d => parseFloat(d.values[1].ttt)))
			let rain = Math.max.apply(null, forecast['24hours'].map(d => parseFloat(d.values[6].pr3)))
			response.statusCode = 200
			response.end(HTML.format(getMessage(temperature, rain)))
		}, error => {
			response.statusCode = 500
			response.end(HTML.format('ke ahnig'))
		})
}).listen(PORT)
