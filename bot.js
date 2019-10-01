"use strict"

// .env ファイルから環境変数の設定値を取得する
require("dotenv").config();

// 必要なモジュールをインポート
const express = require("express");
const app = express();
const uuid = require("uuid/v4");
const cache = require("memory-cache");

// サーバー起動
app.listen(process.env.PORT || 5000, () => {
    console.log(`server is listening to ${process.env.PORT || 5000}...`);
});

// LINE Pay API SDK の初期化
const line_pay = require("line-pay");
const pay = new line_pay({
    channelId: process.env.LINE_PAY_CHANNEL_ID,
    channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
    isSandbox: true
})

// LINE Messaging API SDK　の初期化
const line_bot = require("@line/bot-sdk");
const bot_config = {
    channelAccessToken: process.env.LINE_BOT_ACCESS_TOKEN,
    channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
}
const bot_middleware = line_bot.middleware(bot_config);
const bot_client = new line_bot.Client(bot_config);

const PRODUCT_NAME = "チョコレート"

// Messaging API の Webhook
app.post("/webhook", bot_middleware, (req, res, next) => {
    res.sendStatus(200);

    req.body.events.map((event) => {
        // 接続確認の場合は無視する
        console.log(`Event: ${JSON.stringify(event)}`);
        if (event.replyToken == "00000000000000000000000000000000" || event.replyToken == "ffffffffffffffffffffffffffffffff") {
            console.log(`Had Connection check!!`);
            return;
        }

        // "チョコレート"と言ってきたら決済を始める
        if (event.type === "message") {
            if (event.message.text === PRODUCT_NAME) {
                let product_name = PRODUCT_NAME;
                let reservation = {
                    productName: product_name,
                    productImageUrl: "https://2.bp.blogspot.com/-zEtBQS9hTfI/UZRBlbbtP8I/AAAAAAAASqE/vbK1D7YCNyU/s400/valentinesday_itachoco2.png",
                    amount: 10,
                    currency: "JPY",
                    orderId: uuid(),
                    confirmUrl: process.env.LINE_PAY_CONFIRM_URL,
                    confirmUrlType: "SERVER"
                }

                pay.reserve(reservation).then((response) => {
                    // 決済予約オブジェクトにトランザクションIDとuserIdを格納する
                    reservation.transactionId = response.info.transactionId;
                    reservation.userId = event.source.userId;
                    console.log(`Reservation was made. Detail is following.`);
                    console.log(reservation);
                    // 注文情報としてDBに保存する
                    cache.put(response.info.transactionId, reservation);
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
                });
            }
        }
    });
});

// ユーザーが決済を認証した時に、APIからのWebhookで実行される関数
app.get("/pay/confirm", (req, res, next) => {
    if (!req.query.transactionId) {
        console.log("Transaction Id not found.");
        return res.status(400).send("Transaction Id not found.");
    }

    // 注文情報をDBから取得する
    let reservation = cache.get(req.query.transactionId);
    if (!reservation) {
        console.log("Reservation not found.");
        return res.status(400).send("Reservation not found.")
    }
    console.log(`Retrieved following reservation.`);
    console.log(reservation);

    let confirmation = {
        transactionId: req.query.transactionId,
        amount: reservation.amount,
        currency: reservation.currency
    }
    console.log(`Going to confirm payment with following options.`);
    console.log(confirmation);

    // 決済を確定させる
    return pay.confirm(confirmation).then((response) => {
        res.sendStatus(200);

        // 決済完了メッセージをユーザーに返す
        let messageText = "ありがとうございます！" + PRODUCT_NAME + "の決済が完了しました。";
        let bubble = {
            "type": "bubble",
            "hero": {
                "type": "image",
                "url": "https://3.bp.blogspot.com/-nrwPWwcAaOA/VRE4WqEKBSI/AAAAAAAAsV0/8D61LcHzjAk/s400/aisatsu_arigatou.png",
                "size": "4xl",
                "aspectRatio": "330:400",
                "aspectMode": "cover"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "backgroundColor": "#f4f4f4",
                "contents": [
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
                                        "color": "#000000",
                                        "size": "xl",
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
        let message = {
            "type": "flex",
            "altText": messageText,
            "contents": bubble
        }
        return bot_client.pushMessage(reservation.userId, message);
    });
});
