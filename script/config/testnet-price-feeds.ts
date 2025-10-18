import { ZeroAddress } from "ethers"

interface PriceFeed {
    asset: string,
    priceFeedId: string
}

export const TESTNET_PRICE_FEEDS: Record<number, PriceFeed[]> = {
    97: [
        { asset: ZeroAddress, priceFeedId: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f" },
    ],
    43113: [
        { asset: ZeroAddress, priceFeedId: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7" }
    ],
    11155420: [
        { asset: ZeroAddress, priceFeedId: "0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf"}
    ],
    421614: [
        { asset: ZeroAddress, priceFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"}
    ],
    84532: [
        { asset: ZeroAddress, priceFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" }
    ],
    11155111: [
        { asset: ZeroAddress, priceFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" }
    ]
}