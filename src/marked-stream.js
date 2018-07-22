'use strict'

import marked from 'marked'
import stream from 'stream'

class MarkedStream extends stream.Transform {
	_transform(chunk, encoding, callback) {
		this.push(marked(chunk.toString()))
		callback()
	}
}

export default function(...args) {
	return new MarkedStream(...args)
}
