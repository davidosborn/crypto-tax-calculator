'use strict'

import stream from 'stream'
import formatTime from './format-time'

/**
 * A disposition.
 * @typedef {object} Disposition
 * @property {string} [exchange] The exchange on which the disposition was executed.
 * @property {number} amount     The amount.
 * @property {number} acb        The adjusted cost base.
 * @property {number} pod        The proceeds of disposition.
 * @property {number} oae        The outlays and expenses.
 * @property {number} gain       The capital gain (or loss).
 */
/**
 * The ledger for an asset.
 * @typedef {object} Ledger
 * @property {number}              acb          The adjusted cost base.
 * @property {number}              balance      The balance.
 * @property {array.<Disposition>} dispositions The dispositions.
 */
/**
 * The captial gains.
 * @typedef {object} CapitalGains
 * @property {array.<Trade>}           trades               The trades.
 * @property {object.<string, Ledger>} ledgerByAsset        The ledger of each asset.
 * @property {Disposition}             aggregateDisposition The aggregate disposition.
 * @property {number}                  taxableGain          The taxable gain (or loss).
 */
/**
 * The initial balance and ACB of an asset.
 * This is typically carried forward from the previous year.
 * @typedef {object} Forward
 * @property {number} balance The balance.
 * @property {number} acb     The adjusted cost base.
 */

/**
 * A stream that calculates the capital gains.
 */
class CapitalGainsCalculateStream extends stream.Transform {
	/**
	 * Initializes a new instance.
	 * @param {object}                   [options]         The options.
	 * @param {object.<string, Forward>} [options.forward] The initial balance and ACB of each asset.
	 */
	constructor(options) {
		super({
			objectMode: true
		})

		/**
		 * The trades.
		 * @type {Trade}
		 */
		this._trades = []

		/**
		 * The ledger of each asset.
		 * @type {Map.<string, Ledger>}
		 */
		this._ledgerByAsset = new Map

		/**
		 * The assets that had a negative balance.
		 * @type {Set}
		 */
		this._assetsWithNegativeBalance = new Set

		// Create the ledger for assets that have been carried forward from the previous year.
		if (options?.forward) {
			for (let [asset, forward] of Object.entries(options.forward)) {
				this._ledgerByAsset.set(asset, {
					acb: forward.acb,
					balance: forward.balance,
					dispositions: []
				})
			}
		}
	}

	/**
	 * Accumulates the capital gains for a transaction.
	 * @param {Transaction} chunk    The transaction.
	 * @param {string}      encoding The encoding type (always 'Buffer').
	 * @param {function}    callback A callback for when the transformation is complete.
	 */
	_transform(chunk, encoding, callback) {
		this._trades.push(chunk)

		let ledger = this._ledgerByAsset.get(chunk.asset)
		if (ledger === undefined)
			this._ledgerByAsset.set(chunk.asset, ledger = {
				acb: 0,
				balance: 0,
				dispositions: []
			})

		if (chunk.amount < 0) {
			if (!ledger.balance) {
				console.log('WARNING: Disposition of ' + chunk.asset + ' from an empty balance on ' + formatTime(chunk.time) + '.')
			}

			let acbPerUnit = ledger.balance ? ledger.acb / ledger.balance : 0

			let disposition = {
				exchange: chunk.exchange,
				amount:  -chunk.amount,
				pod:      chunk.value,
				oae:      chunk.fee,
				time:     chunk.time
			}
			disposition.acb = disposition.amount * acbPerUnit
			disposition.gain = disposition.pod - disposition.acb - disposition.oae
			ledger.dispositions.push(disposition)

			ledger.acb += acbPerUnit * chunk.amount
		}
		else
			ledger.acb += chunk.value + chunk.fee

		ledger.balance += chunk.amount

		// Check whether the balance is negative, which would indicate an accounting error.
		if (ledger.balance < -0.000000005 && !this._assetsWithNegativeBalance.has(chunk.asset)) {
			this._assetsWithNegativeBalance.add(chunk.asset)
			console.log('WARNING: Encountered a negative balance for ' + chunk.asset + '.')
		}

		callback()
	}

	_final(callback) {
		// Calculate the aggregate disposition of each asset.
		for (let ledger of this._ledgerByAsset.values())
			ledger.aggregateDisposition = ledger.dispositions.reduce(
				function(a, b) {
					return {
						amount: a.amount + b.amount,
						acb:    a.acb    + b.acb,
						pod:    a.pod    + b.pod,
						oae:    a.oae    + b.oae,
						gain:   a.gain   + b.gain
					}
				}, {
					amount: 0,
					acb:    0,
					pod:    0,
					oae:    0,
					gain:   0
				})

		// Calculate the aggregate disposition of all assets.
		let aggregateDisposition = Array.from(this._ledgerByAsset.values(),
			function(ledger) {
				return ledger.aggregateDisposition
			})
			.reduce(
				function(a, b) {
					return {
						amount: a.amount + b.amount,
						acb:    a.acb    + b.acb,
						pod:    a.pod    + b.pod,
						oae:    a.oae    + b.oae,
						gain:   a.gain   + b.gain
					}
				}, {
					amount: 0,
					acb:    0,
					pod:    0,
					oae:    0,
					gain:   0
				})

		this.push({
			trades: this._trades,
			ledgerByAsset: this._ledgerByAsset,
			aggregateDisposition: aggregateDisposition,
			taxableGain: aggregateDisposition.gain / 2 // Capital gains are taxable at 50%.
		})

		callback()
	}
}

export default function(...args) {
	return new CapitalGainsCalculateStream(...args)
}
