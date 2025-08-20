import Web3 from 'web3'
import { ethers, ParamType } from 'ethers';
import { AbiItem } from 'web3-utils';
import { G1Point, G2Point } from '../crypto/bls/attestation';
import * as ethUtil from "ethereumjs-util"

const web3 = new Web3("http://localhost:8545")
const defaultAbiCoder = new ethers.AbiCoder();

export function bigIntCmp(a: any, b: any){
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

export function typedEntries<T0 extends any, T1>(obj: object): [T0, T1][] {
	return Object.entries(obj).map(([key, val]) => ([key as T0, val as T1]))
}

export function decodeTxReceiptLogs(receipt: any, contractAbi: AbiItem[]): any[] {
    if (!receipt || !receipt.logs) {
        console.error('No logs found in the receipt');
        return;
    }
	const results:any[] = []

    // Iterate over each log in the receipt
    for (const log of receipt.logs) {
        for (const abiItem of contractAbi) {
            // Ensure it's an event type
            if (abiItem.type !== 'event') continue;

            const eventAbi: any = abiItem;
            const eventSignature = web3.eth.abi.encodeEventSignature(eventAbi);

            // Check if the log matches the event signature
            if (log.topics[0] === eventSignature) {
				// Decode the log
				results[results.length] = web3.eth.abi.decodeLog(
					// @ts-ignore
					eventAbi.inputs!,
					log.data,
					log.topics.slice(1)
				);
            }
        }
    }
	return results
}

export function decodeTxLog(log: any, eventAbi: any) {
    const eventSignature = web3.eth.abi.encodeEventSignature(eventAbi);
    if (log.topics[0] === eventSignature) {
        // Decode the log
        return web3.eth.abi.decodeLog(
            // @ts-ignore
            eventAbi.inputs!,
            log.data,
            log.topics.slice(1)
        );
    }
    else
        return null;
}

export function abiEncodeData(types: ReadonlyArray<string | ParamType>, values: ReadonlyArray<any>): string {
    return defaultAbiCoder.encode(types, values);
}

export type GetEventsOptions = {
	fromBlock: string|number,
	toBlock: string|number
}

export function getContractEvents(contract: any, eventName: string, options: any): Promise<any> {
    return new Promise((resolve, reject) => {
        contract.events[eventName](options, (error:any, events: any) => {
			if(error)
				reject(error)
			else
				resolve(events)
		})
	});
}

export function g1PointToArgs(p: G1Point): {X: string, Y: string} {
	return {
		X: "0x" + p.getX().getStr(16).padStart(64, '0'),
		Y: "0x" + p.getY().getStr(16).padStart(64, '0'),
	}
}

export function g2PointToArgs(p: G2Point): {X: [string, string], Y: [string, string]} {
	return {
		X: [
			"0x" + p.getX().get_b().getStr(16).padStart(64, '0'),
			"0x" + p.getX().get_a().getStr(16).padStart(64, '0'),
		],
		Y: [
			"0x" + p.getY().get_b().getStr(16).padStart(64, '0'),
			"0x" + p.getY().get_a().getStr(16).padStart(64, '0'),
		]
	}
}

export function g2PointFromArgs(args:{X:[string, string], Y: [string, string]}): G2Point {
	return new G2Point(
		BigInt(args.X[0]),
		BigInt(args.X[1]),
		BigInt(args.Y[0]),
		BigInt(args.Y[1]),
	)
}

export function signRawData(data: string, privateKey: string): string {
	function removeHexPrefix(hexString: string) {
		if (hexString.startsWith('0x') || hexString.startsWith('0X')) {
			return hexString.slice(2);
		}
		return hexString;
	}
    const { v, r, s } = ethUtil.ecsign(
		Buffer.from(removeHexPrefix(data), 'hex'), 
		Buffer.from(removeHexPrefix(privateKey), 'hex')
	);
    return ethUtil.toCompactSig(v, r, s);
}

// encode objects containing BigInt
export function jsonEncode(obj: any, replacer?: any , space?: string | number) {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') {
            return value.toString() + "n"; // Append 'n' to mark as BigInt
        }
        return value;
    }, space);
}

// decode json objects containing BigInt
export function jsonDecode(jsonStr: string) {
    return JSON.parse(jsonStr, (key, value) => {
        if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
            return BigInt(value.slice(0, -1)); // Remove 'n' and convert to BigInt
        }
        return value;
    });
}

export function obj2arr<T extends unknown[]>(obj: any): T {
    const length = Object.keys(obj).length;
    return Array.from({ length }, (_, i) => obj[i]) as T;
}
