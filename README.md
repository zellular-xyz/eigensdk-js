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

## Examples

Aggregate BLS signatures and verify using aggregated public key

```typescript

import { KeyPair, G2Point, Signature } from './attestation';
import * as ethers from 'ethers';

function hashFunction(input: string): string {
	return ethers.keccak256(Buffer.from(input));
}

const textMessage = "sample text to sign"
const msgHash = hashFunction(textMessage)

const keyPair1 = new KeyPair()
const keyPair2 = KeyPair.fromString("04")

const sign1:Signature = keyPair1.signMessage(msgHash)
const sign2:Signature = keyPair2.signMessage(msgHash)

const aggregatedSignature:Signature = sign1.add(sign2);
const aggregatedPubG2:G2Point = keyPair1.pubG2.add(keyPair2.pubG2)

const verified = aggregatedSignature.verify(aggregatedPubG2, msgHash)
```
