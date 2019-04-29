'use strict'

import fetch from 'node-fetch'
import process from 'process'
import stream from 'stream'
import Assets from './assets'

/**
 * A trade.
 * @typedef {object} Trade
 * @property {string}  exchange    The exchange on which the trade was executed.
 * @property {string}  baseAsset   The base currency.
 * @property {number}  baseAmount  The amount of the base currency.
 * @property {string}  quoteAsset  The quote currency.
 * @property {number}  quoteAmount The amount of the quote currency.
 * @property {string}  feeAsset    The currency of the transaction fee.
 * @property {number}  feeAmount   The amount of the transaction fee.
 * @property {number}  time        The time at which the trade occurred, as a UNIX timestamp.
 * @property {boolean} sell        True if the trade represents a sale.
 * @property {number}  [value]     The value of the assets, in Canadian dollars.
 * @property {number}  [feeValue]  The value of the transaction fee, in Canadian dollars.
 */

/**
 * A stream that transforms CSV records into trades.
 */
class TradeParseStream extends stream.Transform {
	/**
	 * The functions that can be used to parse a trade, indexed by the keys of the record.
	 * @type {object.<string, function.<object>>}
	 */
	static _parsers = {
		'Date(UTC)|Market|Type|Price|Amount|Total|Fee|Fee Coin': TradeParseStream.prototype._transformBinance,
		'OrderUuid|Exchange|Type|Quantity|Limit|CommissionPaid|Price|Opened|Closed': TradeParseStream.prototype._transformBittrex1,
		'Uuid|Exchange|TimeStamp|OrderType|Limit|Quantity|QuantityRemaining|Commission|Price|PricePerUnit|IsConditional|Condition|ConditionTarget|ImmediateOrCancel|Closed': TradeParseStream.prototype._transformBittrex2,
		'txid|refid|time|type|aclass|asset|amount|fee|balance': TradeParseStream.prototype._transformKraken,
		'Coin|Time|Buy/Sell|Filled Price|Amount|Fee|Volume': TradeParseStream.prototype._transformKuCoin,
		'Base asset|Base amount|Quote asset|Quote amount|Fee asset|Fee amount|Time|Comments': TradeParseStream.prototype._transformCustom
	}

	/**
	 * Initializes a new instance.
	 */
	constructor() {
		super({
			objectMode: true
		})

		/**
		 * A buffer that can be used to store multiple chunks that make up a single trade.
		 * @type {array.<object>}
		 */
		this._tradeChunks = []

		/**
		 * The keys of the unrecognized trades.
		 * @type {Set}
		 */
		this._unrecognizedTrades = new Set
	}

	/**
	 * Transforms a CSV record into a trade.
	 * @param {object}   chunk    The CSV record.
	 * @param {string}   encoding The encoding type (always 'Buffer').
	 * @param {function} callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		delete chunk.flatten
		delete chunk.flatMap

		let keys = Object.keys(chunk).join('|')
		let parser = TradeParseStream._parsers[keys]
		if (parser)
			await parser.call(this, chunk)
		else if (!this._unrecognizedTrades.has(keys)) {
			this._unrecognizedTrades.add(keys)
			console.log('WARNING: Unrecognized trade keys: "' + keys + '".')
		}

		callback()
	}

	/**
	 * Transforms a CSV record from Binance into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformBinance(chunk) {
		let amount = TradeParseStream._parseNumber(chunk['Amount'])
		let price = TradeParseStream._parseNumber(chunk['Price'])

		this.push({
			exchange: 'Binance',
			baseAsset: Assets.normalizeCode(chunk['Market'].substring(chunk['Market'].length - 3)),
			baseAmount: amount * price,
			quoteAsset: Assets.normalizeCode(chunk['Market'].substring(0, chunk['Market'].length - 3)),
			quoteAmount: amount,
			feeAsset: Assets.normalizeCode(chunk['Fee Coin']),
			feeAmount: TradeParseStream._parseNumber(chunk['Fee']),
			time: TradeParseStream._parseTime(chunk['Date(UTC)']),
			sell: chunk['Type'].includes('SELL')
		})
	}

	/**
	 * Transforms a CSV record from Bittrex into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformBittrex1(chunk) {
		let [baseAsset, quoteAsset] = chunk['Exchange'].split('-')
		baseAsset = Assets.normalizeCode(baseAsset)
		quoteAsset = Assets.normalizeCode(quoteAsset)

		this.push({
			exchange: 'Bittrex',
			baseAsset: baseAsset,
			baseAmount: TradeParseStream._parseNumber(chunk['Price']),
			quoteAsset: quoteAsset,
			quoteAmount: TradeParseStream._parseNumber(chunk['Quantity']),
			feeAsset: baseAsset,
			feeAmount: TradeParseStream._parseNumber(chunk['CommissionPaid']),
			time: TradeParseStream._parseTime(chunk['Closed']),
			sell: chunk['Type'].includes('SELL')
		})
	}

	/**
	 * Transforms a CSV record from Bittrex into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformBittrex2(chunk) {
		let [baseAsset, quoteAsset] = chunk['Exchange'].split('-')
		baseAsset = Assets.normalizeCode(baseAsset)
		quoteAsset = Assets.normalizeCode(quoteAsset)

		let quantity = TradeParseStream._parseNumber(chunk['Quantity'])
		let quantityRemaining = TradeParseStream._parseNumber(chunk['QuantityRemaining'])

		this.push({
			exchange: 'Bittrex',
			baseAsset: baseAsset,
			baseAmount: TradeParseStream._parseNumber(chunk['Price']),
			quoteAsset: quoteAsset,
			quoteAmount: quantity - quantityRemaining,
			feeAsset: baseAsset,
			feeAmount: TradeParseStream._parseNumber(chunk['Commission']),
			time: TradeParseStream._parseTime(chunk['TimeStamp']),
			sell: chunk['OrderType'].includes('SELL')
		})
	}

	/**
	 * Transforms a CSV record from Kraken into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformKraken(chunk) {
		let chunks = this._tradeChunks

		// We only care about trades.
		if (chunk['type'] !== 'trade') {
			if (chunks.length > 0) {
				console.log('WARNING: Found unpaired trade chunk.')
				chunks.length = 0
			}
			return
		}

		// Normalize the properties of the chunk.
		chunk = {
			asset: Assets.normalizeCode(chunk['asset']),
			amount: TradeParseStream._parseNumber(chunk['amount']),
			time: TradeParseStream._parseTime(chunk['time']),
			fee: TradeParseStream._parseNumber(chunk['fee'])
		}

		// Process two consecutive trade chunks as a single trade.
		chunks.push(chunk)
		if (chunks.length === 2) {
			// Ensure the chunks have the same timestamp.
			if (chunks[0].time !== chunks[1].time)
				console.log('WARNING: Found paired trade chunks with different timestamps.')

			// Determine which chunks represent the base and quote of the currency pair.
			let priorities = chunks.map(c => Assets.getPriority(c.asset))
			let isCurrencyPairReversed = priorities[0] < priorities[1]
			let baseChunk = chunks[+!isCurrencyPairReversed]
			let quoteChunk = chunks[+isCurrencyPairReversed]

			this.push({
				exchange: 'Kraken',
				baseAsset: baseChunk.asset,
				baseAmount: Math.abs(baseChunk.amount),
				quoteAsset: quoteChunk.asset,
				quoteAmount: Math.abs(quoteChunk.amount),
				feeAsset: baseChunk.asset,
				feeAmount: baseChunk.fee,
				time: baseChunk.time,
				sell: baseChunk.amount > 0 || quoteChunk.amount < 0
			})

			chunks.length = 0
		}
	}

	/**
	 * Transforms a CSV record from KuCoin into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformKuCoin(chunk) {
		// If this is not a trade, then drop it.
		let buySell = chunk['Buy/Sell']
		if (buySell !== 'Buy' && buySell !== 'Sell')
			return

		let [quoteAsset, baseAsset] = chunk['Coin'].split('/')
		baseAsset = Assets.normalizeCode(baseAsset)
		quoteAsset = Assets.normalizeCode(quoteAsset)

		const splitAmountAssetRegExp = /^([0-9.,]+)([A-Za-z][A-Za-z0-9]*)$/

		let [baseAmount, baseAmountAsset] = chunk['Volume'].match(splitAmountAssetRegExp).slice(1)
		let [quoteAmount, quoteAmountAsset] = chunk['Amount'].match(splitAmountAssetRegExp).slice(1)
		let [feeAmount, feeAsset] = chunk['Fee'].match(splitAmountAssetRegExp).slice(1)

		baseAmountAsset = Assets.normalizeCode(baseAmountAsset)
		quoteAmountAsset = Assets.normalizeCode(quoteAmountAsset)
		feeAsset = Assets.normalizeCode(feeAsset)

		if (baseAmountAsset !== baseAsset) {
			console.log('WARNING: Expected amount of ' + baseAsset + ' but found ' + baseAmountAsset + ' instead.')
			return
		}
		if (quoteAmountAsset !== quoteAsset) {
			console.log('WARNING: Expected amount of ' + quoteAsset + ' but found ' + quoteAmountAsset + ' instead.')
			return
		}

		this.push({
			exchange: 'KuCoin',
			baseAsset: baseAsset,
			baseAmount: TradeParseStream._parseNumber(chunk['Volume']),
			quoteAsset: quoteAsset,
			quoteAmount: TradeParseStream._parseNumber(chunk['Amount']),
			feeAsset: feeAsset,
			feeAmount: feeAmount,
			time: TradeParseStream._parseTime(chunk['Time']),
			sell: buySell === 'Sell'
		})
	}

	/**
	 * Transforms a custom CSV record into a trade.
	 * @param {object} chunk The CSV record.
	 */
	async _transformCustom(chunk) {
		// Ignore trades that include a special token in the comments.
		if (chunk['Comments'].includes('IGNORE'))
			return

		let baseAmount = TradeParseStream._parseNumber(chunk['Base amount'])
		let quoteAmount = TradeParseStream._parseNumber(chunk['Quote amount'])

		this.push({
			exchange: 'Custom',
			baseAsset: Assets.normalizeCode(chunk['Base asset']),
			baseAmount: Math.abs(baseAmount),
			quoteAsset: Assets.normalizeCode(chunk['Quote asset']),
			quoteAmount: Math.abs(quoteAmount),
			feeAsset: Assets.normalizeCode(chunk['Fee asset']),
			feeAmount: TradeParseStream._parseNumber(chunk['Fee amount']),
			time: TradeParseStream._parseTime(chunk['Time']),
			sell: baseAmount > 0 || quoteAmount < 0
		})
	}

	/**
	 * Parses a number.
	 * @param {string} s The string.
	 * @returns {number} The number.
	 */
	static _parseNumber(s) {
		return parseFloat(s.replace(',', ''))
	}

	/**
	 * Parses a time.
	 * @param {string} s The string.
	 * @returns {number} The time, as a UNIX timestamp.
	 */
	static _parseTime(s) {
		return new Date(s).getTime()
	}
}

export default function(...args) {
	return new TradeParseStream(...args)
}
