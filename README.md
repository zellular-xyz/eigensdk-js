# eigensdk-js

A Javascript SDK for EigenLayer, derived from the official [eigensdk-go](https://github.com/layr-Labs/eigensdk-go/tree/master/) implementation.

> [!CAUTION]
> This library is a PoC implemented for the EigenLayer hackathon. Do not use it in Production, testnet only.


## Example

You can use [Incredible Squaring Javascript AVS](https://github.com/zellular-xyz/incredible-squaring-avs-js/) as an example application using this SDK. 

## Test

Tests use the anvil chain snapshot of the [Incredible Squaring AVS](https://github.com/zellular-xyz/incredible-squaring-avs-js?tab=readme-ov-file#running). To run tests, use the following commands after running the anvil chain as described [here](https://github.com/zellular-xyz/incredible-squaring-avs-js?tab=readme-ov-file#running):

```
$ npm run test
```