'use strict'

require('babel-register')
require('./main').default(require('process').argv.slice(2))
