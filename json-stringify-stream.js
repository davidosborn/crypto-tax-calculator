'use strict'

import stream from 'stream'

class JsonStringifyStream extends stream.Transform {
	constructor() {
		super({
			writableObjectMode: true
		})
	}

	_transform(chunk, encoding, callback) {
		this.push(JSON.stringify(chunk))
		this.push('\n')
		callback()
	}
}

export default function(...args) {
	return new JsonStringifyStream(...args)
}
