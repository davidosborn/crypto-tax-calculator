# Capital Gains Calculator

This software can calculate the capital gains for cryptocurrency assets from a set of trade logs,
using the *adjusted cost base* (ACB), which is the standard for Canadian taxes.

## Exchanges

Trade logs from the following exchanges are supported:
- Binance
- Bittrex
- Kraken

## TODO

- Add support for more exchanges.
- Refactor the code from trade parser for individual exchanges into separate modules.
- Add more end-points for finding the value of an asset at a specific time.
- Remove the hard-coded end-point for the BNB asset.
