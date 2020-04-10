const handler = require('serve-handler')
const http = require('http')
const server = http.createServer((request, response) => {
	return handler(request, response, {
		rewrites: [{
			source: '/**',
			destination: 'index.html'
		}]
	})
})
server.listen(process.env.PORT || 5000)
