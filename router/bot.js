"use strict";

require("dotenv").config();

const router = require("express").Router();
const uuid = require("uuid/v4");
const cache = require("memory-cache"); // To save order information.
const debug = require("debug")("line-pay:bot");

// LINE Pay API SDK の初期化
const line_pay = require("../line-pay/line-pay");
const pay = new line_pay({
    channelId: process.env.LINE_PAY_CHANNEL_ID,
    channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
    isSandbox: true
});

// LINE Messaging API SDK　の初期化
const line_bot = require("@line/bot-sdk");
const bot_config = {
    channelAccessToken: process.env.LINE_BOT_ACCESS_TOKEN,
    channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
}
const bot_middleware = line_bot.middleware(bot_config);
const bot_client = new line_bot.Client(bot_config);

const PRODUCT_NAME = "チョコレート";
const PRODUCT_ID = "CHOCOLATE";
const PRODUCT_AMOUNT = 10;
const PRODUCT_IMAGE_URL = "https://2.bp.blogspot.com/-zEtBQS9hTfI/UZRBlbbtP8I/AAAAAAAASqE/vbK1D7YCNyU/s400/valentinesday_itachoco2.png"

router.post("/hoge", (req, res, next) => {
    debug(`bot router "/hoge" called!!`);
    debug(`req.body: ${req}`);
    console.log(req);
    console.log(req.body);
    debug(`req.body: ${JSON.stringify(req.body)}`);
    res.sendStatus(200);
});

router.post("/", bot_middleware, (req, res, next) => {
    debug(`bot router "/" called!!`);
    debug(`req.body: ${JSON.stringify(req.body)}`);
    debug(`req.body.events: ${JSON.stringify(req.body.events)}`);
    res.sendStatus(200);
    // Event情報ごとに処理をする
    req.body.events.map((event) => {
        // 接続確認の場合は無視する
        debug(`Event: ${JSON.stringify(event)}`);
        if (event.replyToken == "00000000000000000000000000000000" || event.replyToken == "ffffffffffffffffffffffffffffffff") {
            debug(`Had Connection check!!`);
            return;
        }
        // LINE Pay Request API のパラメータ
        const packages = [
            {
                id: "package_id",
                amount: PRODUCT_AMOUNT,
                name: PRODUCT_NAME,
                products: [
                    {
                        id: PRODUCT_ID,
                        name: PRODUCT_NAME,
                        imageUrl: PRODUCT_IMAGE_URL,
                        quantity: 1,
                        price: PRODUCT_AMOUNT
                    }
                ]
            }
        ]
        const hostname = "8f847eba.ngrok.io";
        let options = {
            amount: PRODUCT_AMOUNT,
            currency: "JPY",
            orderId: uuid(),
            packages: packages,
            redirectUrls: {
                confirmUrl: `https://${hostname}${req.baseUrl}/confirm`,
                cancelUrl: `https://${hostname}${req.baseUrl}/cancel`,
            }
        }
        debug(`Call LINE Pay Request API!!`);
        debug(`LINE Pay Request API Parameters : ${JSON.stringify(options)}`);
        pay.request(options).then((response) => {
            let reservation = options;
            reservation.transactionId = response.info.transactionId;
            // API Result
            debug(`Return code: ${response.returnCode}`);
            debug(`Return message: ${response.returnMessage}`);
            debug(`Reservation was made. Detail is following.`);
            debug(reservation);
            // Save order information
            cache.put(reservation.transactionId, reservation);
            // LINE Pay 決済用メッセージをリプライ送信する
            let messageText = PRODUCT_NAME + "を購入するには下記のボタンで決済に進んでください";
            let bubble = {
                "type": "bubble",
                "hero": {
                    "type": "image",
                    "url": "https://2.bp.blogspot.com/-zEtBQS9hTfI/UZRBlbbtP8I/AAAAAAAASqE/vbK1D7YCNyU/s400/valentinesday_itachoco2.png",
                    "size": "4xl",
                    "aspectRatio": "1:1",
                    "aspectMode": "cover"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#f4f4f4",
                    "contents": [
                        {
                            "type": "text",
                            "text": PRODUCT_NAME,
                            "weight": "bold",
                            "size": "xl"
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "margin": "lg",
                            "spacing": "sm",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "baseline",
                                    "spacing": "sm",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": messageText,
                                            "wrap": true,
                                            "color": "#666666",
                                            "size": "sm",
                                            "flex": 5
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "sm",
                    "backgroundColor": "#f4f4f4",
                    "contents": [
                        {
                            "type": "button",
                            "style": "primary",
                            "height": "sm",
                            "action": {
                                "type": "uri",
                                "label": "LINE Payで決済",
                                "uri": response.info.paymentUrl.web
                            }
                        },
                        {
                            "type": "spacer",
                            "size": "sm"
                        }
                    ],
                    "flex": 0
                }
            }
            let message = {
                "type": "flex",
                "altText": messageText,
                "contents": bubble
            }
            return bot_client.replyMessage(event.replyToken, message);
            // Redirect to paymentUrl
            // res.redirect(response.info.paymentUrl.web);
        });
    });
});

router.get("/confirm", (req, res, next) => {
    debug(`transactionId is ${req.query.transactionId}`);
    let reservation = cache.get(req.query.transactionId);

    if (!reservation){
        throw new Error("Reservation not found.");
    }

    debug(`Retrieved following reservation.`);
    debug(reservation);

    let options = {
        transactionId: req.query.transactionId,
        amount: reservation.amount,
        currency: reservation.currency
    }

    debug(`Going to confirm payment with following options.`);
    debug(options);

    pay.confirm(options).then((response) => {
        res.json(response);
    });
});

router.get("/cancel", (req, res, next) => {
    debug(`Cancel called!: ${req}`);
});

module.exports = router;
