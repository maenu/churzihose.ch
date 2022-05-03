const { watch, readdir, rm, copyFile } = require('fs/promises')
const { join } = require('path')
const { spawnSync, fork } = require('child_process')

let child = fork('index.js')

const update = async (event) => {
	if (event.filename.endsWith('node_modules')) {
		return	
	}
	console.log('kill child', event.eventType, event.filename)
	child.kill()
	console.log('prune .')
	const targets = await readdir('.', { withFileTypes: true })
	for (const file of targets) {
		if (file.isDirectory()) {
			continue
		}
		console.log('rm ', file.name)
		await rm(file.name)
	}
	console.log('fill . with /opt/src')
	const sources = await readdir('/opt/src', { withFileTypes: true })
	for (const file of sources) {
		if (file.isDirectory()) {
			continue
		}
		console.log('cp ', file.name)
		await copyFile(join('/opt/src', file.name), file.name)
	}
	if (event.filename.endsWith('package.json')) {
		console.log('install modules in .')
		spawnSync('npm install')
	}
	console.log('start process')
	child = fork('index.js')
}

(async () => {
	await update({
		eventType: 'INIT',
		filename: 'package.json'
	})
    for await (const event of watch('/opt/src')) {
		await update(event)
    }
})()
