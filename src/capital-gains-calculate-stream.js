'use strict'

import stream from 'stream'

class CapitalGainsCalculateStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})

		this._trades = []
		this._ledgerByAsset = new Map
	}

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
			let disposition = {
				amount: -chunk.amount,
				pod:    chunk.value,
				oae:    chunk.fee,
				time:   chunk.time
			}
			disposition.acb = disposition.amount * ledger.acb
			disposition.gain = disposition.pod - disposition.acb - disposition.oae
			ledger.dispositions.push(disposition)
		}
		else
			ledger.acb = (ledger.acb * ledger.balance + chunk.value) / (ledger.balance + chunk.amount)

		ledger.balance += chunk.amount

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
			taxableGain: aggregateDisposition.gain * .5
		})

		callback()
	}
}

export default function(...args) {
	return new CapitalGainsCalculateStream(...args)
}
