require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

// ---- CONFIG (use env vars in real life) ----
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || "xoxp-your-user-token";


const app = new express();

// Slack slash commands send urlencoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());

/**
 * One endpoint:
 * - Slack slash command hits this (e.g. /ai-summary some text)
 * - We send the text to the model
 * - We post the summary back to the same Slack channel
 */
app.post("/slack/ai-summary", async (req, res) => {
    try {
        const { text, channel_id, user_name,user_id } = req.body;

        console.log(text, channel_id,user_id);

        // Immediately respond to Slack so it doesn't time out (ephemeral ack)
        res.json({
            response_type: "ephemeral",
            text: `Hi ${user_name}, I'm generating a summary for:\n> ${text}`,
        });

        // ---- 1) Call the model with the input text ----

        const response = await axios.post(
            process.env.AI_AGENT_URI,
            {
                "class": "start",
                "content": {
                    "text": text
                }
            },
            {
                headers: {
                    "x-tenant-id": process.env.AI_AGENT_TENANT_ID,
                    "x-api-key": process.env.AI_AGENT_API_KEY,
                    "Content-Type": "application/json"
                },
            }
        )
        const summary = response.data.content[0]?.value || "";
        console.log(summary)
        // ---- 2) Send the summary back to Slack as a normal channel message ----

        const dmRes = await axios.post(
            "https://slack.com/api/conversations.open",
            {
                users: user_id,  // from slash payload
            },
            {
                headers: {
                    Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
            }
        );

        console.log("conversations.open:", dmRes.data);

        if (!dmRes.data.ok) {
            console.error("Error opening DM:", dmRes.data.error);
        }
        const dmChannelId = dmRes.data.channel.id;
        const reply = await axios.post(
            "https://slack.com/api/chat.postMessage",
            {
                channel: dmChannelId,
                text: `*AI Summary:*\n${summary}`,
                mrkdwn: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
                    "Content-Type": "application/json; charset=utf-8",
                },
            }
        );
        console.log(reply)
    } catch (err) {
        console.error("Error in /slack/ai-summary:", err.response?.data || err.message);
        // Can't change the initial response now, but you can optionally
        // send an error message to a fixed channel/logging channel if needed.
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Slack AI summary backend listening on port ${PORT}`);
});
