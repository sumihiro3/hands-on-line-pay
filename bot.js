"use strict"

// .env ファイルから環境変数の設定値を取得する
require("dotenv").config();

// Import packages.
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
    hostname: process.env.LINE_PAY_HOSTNAME,
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
        if (event.replyToken == "00000000000000000000000000000000" || event.replyToken == "ffffffffffffffffffffffffffffffff") return;

        // "チョコレート"と言ってきたら決済を始める
        if (event.type === "message"){
            if (event.message.text === PRODUCT_NAME){
                let product_name = PRODUCT_NAME;
                let reservation = {
                    productName: product_name,
                    amount: 1,
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
                    let message = {
                        type: "template",
                        altText: `${product_name}を購入するには下記のボタンで決済に進んでください`,
                        template: {
                            type: "buttons",
                            text: `${product_name}を購入するには下記のボタンで決済に進んでください`,
                            actions: [
                                {type: "uri", label: "LINE Payで決済", uri: response.info.paymentUrl.web},
                            ]
                        }
                    }
                    return bot_client.replyMessage(event.replyToken, message);
                });
            }
        }
    });
});

// ユーザーが決済を認証した時に、APIからのWebhookで実行される関数
app.get("/pay/confirm", (req, res, next) => {
    if (!req.query.transactionId){
        console.log("Transaction Id not found.");
        return res.status(400).send("Transaction Id not found.");
    }

    // 注文情報をDBから取得する
    let reservation = cache.get(req.query.transactionId);
    if (!reservation){
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

        // 決済完了をユーザーに返す
        let messages = [{
            type: "sticker",
            packageId: 2,
            stickerId: 144
        },{
            type: "text",
            text: "ありがとうございます！" + PRODUCT_NAME + "の決済が完了しました。"
        }]
        return bot_client.pushMessage(reservation.userId, messages);
    });
});
