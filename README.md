# Crypto Tax Calculator

A tool to calculate the capital gains of cryptocurrency assets for Canadian taxes.
The source data comes from a set of trade logs, which are provided by the exchanges.
The *adjusted cost base* (ACB) is used to calculate the capital gains.

The following exchanges are supported:

- Binance
- Bittrex
- Kraken

## TODO

- The latest results differ from the previous results -- this indicates a bug.
- Add support for more exchanges.
- Refactor the code from trade parser for individual exchanges into separate modules.
- Add more end-points for finding the value of an asset at a specific time.
