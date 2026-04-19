const express = require("express");
const axios = require("axios");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const BANK_INFO = {
  bank: "Хаан банк",
  account: "5304820138",
  owner: "Одбаяр",
  iban: "MN79 0005 005304820138",
};

const userConversations = {};
const userStates = {};
const adminTakenOver = {};
const EXCEL_FILE = path.join(__dirname, "zahialga.xlsx");

const SYSTEM_PROMPT = `Чи "Boroldoi AI Studio" зургийн захиалгын Facebook page-ийн туслах ажилтан юм. Сайн байна уу. Та Бородой АЙ студитэй холбогдлоо. Та хэдэн хүнтэй зураг хийлгэх вэ гэж асуу.
ЗААВАЛ Монгол хэлээр хариул. Найрсаг, товч байна. Ямар ч нөхцөлд англиар хариулж болохгүй. Монголоор алдаатай бичиж болохгүй. Хүн рүү нэг удаа текст бичээд хүлээх, нэг хариултаа олон дахин явуулж болохгүй.
Эхлээд мэдээлэл асуухад үнийн мэдээлэл болон зураг хийх хугацааг танилцуулна.
Түүний дараа асуултуудаа асууж эхэлнэ. Харилцагч юм асуусан тохиолдолд хариу бич. Битгий нэг асуултаа давтаад бай

ҮНЭ ЖАГСААЛТ:
1 хүн – 30,000₮
2 хүн – 50,000₮
3 хүн – 70,000₮
4 хүн – 100,000₮
5 хүн – 130,000₮
6 хүн – 160,000₮
7 хүн – 190,000₮
8 хүн – 220,000₮
9 хүн – 250,000₮
10 хүн – 280,000₮
11 хүн – 310,000₮
⚡ Яаралтай (24-48 цаг): +20%, хүргэлт +1 хоног нэмэгдэнэ
📅 Энгийн: 5 хоногт гарна

УГААХ + ЖААЗЛАХ ҮНЭ (хүргэлт үнэгүй):
A4 хэмжээ (арьсан бүрэлттэй угаалт, 20х30см жааз) – 50,000₮
A3 хэмжээ (арьсан бүрэлттэй угаалт, 40х30см жааз) – 80,000₮
Зурах болон угаах үнэ ТУС ТУСДАА тооцогдоно.
Жишээ: 3 хүн зурах (70,000₮) + A4 угаах (50,000₮) = нийт 120,000₮

Хөдөө орон нутгийн захиалганд унаанд тавьж өгнө гэж хариул.
Утасны дугаарыг асуух шаардлагагүй.

ЗАХИАЛГА АВАХ ДЭС ДАРААЛАЛ:
1. Хэдэн хүн зурах вэ? гэж асуу.
2. Яаралтай эсвэл энгийн гэж асуу.
3. Файлаар авах уу, угааж жаазлуулах уу гэж асуу.
4. Угаалга сонговол A4 эсвэл A3 гэж асуу.
5. Хариулт ирсний дараа хүн тус бүрийн царай тод гарсан зургаа явуулаарай гэж асуу. ямар ч зураг явуулсан юм битгий асуу болж байна гэж хэл
6. Нийт үнийг хэлэх.
7. Зургаа явуулсаны дараа хүн тус бүрийн холбоо хамаарал асуух.
8. Зураг явуулсан тохиолдолд бусад зүйл асуухгүй байх. Зураг явуулсан тохиолдолд дахин битгий зураг асуу
10. Утас мэдэгдвэл төлбөрийн JSON тавь.

ЧУХАЛ ДҮРЭМ:
- Өмнөх яриагаа үргэлж санаж байх. Хэрэглэгч өмнө хэлсэн зүйлийг дахин асуухгүй.
- Зөвхөн Монгол хэлээр харилц, алдаагүй бичих.
- Нэг асуулт нэг удаа асуу.
- Яаралтай үнэ = үндсэн үнэ × 1.2 (бүхэл тоо).
- Оператор гэвэл: Оператортой холбогдож байна, хүлээнэ үү 🙋
- Зургийн бизнестэй холбоогүй асуултад: Уучлаарай, би зөвхөн зургийн захиалгын талаар мэдээлэл өгч чадна.
- Угааж жаазлуулж байгаа үед хэвлэж байгаа зурган дээр үг бичүүлэх үнэгүй.

Утас авмагц хариуны төгсгөлд заавал энэ JSON тавь:
###AWAITING_PAYMENT###{"type":"зурах","count":3,"speed":"яаралтай","price":84000,"name":"Болор","phone":"99001122","washSize":"A4","totalPrice":134000}###END###`;

function generateLabel(order) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  let labels = [`${month}-${day}`];
  if (order.speed === "яаралтай") labels.push("яаралтай50");
  if (order.washSize) labels.push(order.washSize);
  return labels.join(" | ");
}

async function saveToExcel(order) {
  const workbook = new ExcelJS.Workbook();
  let worksheet;
  if (fs.existsSync(EXCEL_FILE)) {
    await workbook.xlsx.readFile(EXCEL_FILE);
    worksheet = workbook.getWorksheet("Захиалга");
  } else {
    worksheet = workbook.addWorksheet("Захиалга");
    worksheet.addRow(["№","Огноо","Нэр","Утас","Төрөл","Хүний тоо","Хугацаа","Угаах хэмжээ","Зурах үнэ (₮)","Нийт үнэ (₮)","Төлбөр","Label"]);
    const h = worksheet.getRow(1);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    h.alignment = { horizontal: "center" };
    [5,18,15,13,15,12,12,15,15,15,13,22].forEach((w,i) => { worksheet.getColumn(i+1).width = w; });
  }
  const orderNum = worksheet.rowCount;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const newRow = worksheet.addRow([
    orderNum, dateStr, order.name, order.phone, order.type,
    order.count || "-",
    order.speed === "яаралтай" ? "Яаралтай" : "Энгийн",
    order.washSize || "-",
    order.price?.toLocaleString() || "-",
    (order.totalPrice || order.price)?.toLocaleString(),
    "✅ Төлсөн", order.label,
  ]);
  if (order.speed === "яаралтай") {
    newRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  } else if (order.washSize) {
    newRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  }
  newRow.alignment = { horizontal: "center" };
  await workbook.xlsx.writeFile(EXCEL_FILE);
  return orderNum;
}

async function verifyPaymentScreenshot(imageUrl, expectedAmount) {
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${PAGE_ACCESS_TOKEN}` },
    });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");
    const contentType = imageResponse.headers["content-type"] || "image/jpeg";
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: contentType, data: imageBase64 } },
            { type: "text", text: `Энэ банкны гүйлгээний баримт мышдаа? ${expectedAmount}₮ шилжүүлсэн байна уу? Зөвхөн JSON хариул: {"isPayment": true/false, "confirmed": true/false}` },
          ],
        }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );
    const text = response.data.content[0].text.trim();
    const match = text.match(/\{.*\}/s);
    if (match) return JSON.parse(match[0]);
    return { isPayment: false, confirmed: false };
  } catch (err) {
    console.error("Screenshot шалгах алдаа:", err.message);
    return { isPayment: false, confirmed: false };
  }
}

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    body.entry.forEach(entry => {
      if (entry.messaging) {
        entry.messaging.forEach(event => {

          // =============================================
          // 👤 ADMIN МЕССЕЖ ШАЛГАХ
          // Зөвхөн admin БОДИТ ТЕКСТ бичсэн үед л bot унтарна
          // Seen, read receipt, зураг зэрэг нь тооцохгүй
          // =============================================
          if (event.message?.is_echo) {
            const recipientId = event.recipient?.id;

            // Зөвхөн текст агуулсан мессеж бол bot унтарна
            // Attachments (зураг, sticker) болон системийн мессежийг тооцохгүй
            const hasText = event.message?.text && event.message.text.trim().length > 0;
            const isSystemMsg = event.message?.tags?.data?.some(
              t => t.name === "HUMAN_AGENT"
            );

            if (recipientId && hasText) {
              adminTakenOver[recipientId] = true;
              console.log(`👤 Admin текст бичлээ → bot унтарлаа → ${recipientId}`);
            }
            return;
          }

          if (event.message && !event.message.is_echo) handleMessage(event);
          else if (event.postback) handlePostback(event);
        });
      }
      if (entry.changes) {
        entry.changes.forEach(change => {
          if (change.field === "feed" && change.value?.item === "comment" && change.value?.verb === "add") {
            handleComment(change.value);
          }
        });
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else res.sendStatus(404);
});

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (adminTakenOver[senderId]) {
    console.log(`🔕 Bot унтарсан → ${senderId}`);
    return;
  }

  if (message.attachments) {
    const img = message.attachments.find(a => a.type === "image");
    if (img) {
      if (userStates[senderId]?.awaitingPayment) {
        await handlePaymentScreenshot(senderId, img.payload.url);
      } else {
        await handleOrderImage(senderId, img.payload.url);
      }
      return;
    }
  }

  const text = message.text;
  if (!text) return;

  if (userStates[senderId]?.awaitingPayment) {
    const order = userStates[senderId].order;
    await sendText(senderId,
      `💳 Төлбөрийн мэдээлэл:\n\n🏦 Банк: ${BANK_INFO.bank}\n💳 Дансны дугаар: ${BANK_INFO.account}\n👤 Нэр: ${BANK_INFO.owner}\n🔢 IBAN: ${BANK_INFO.iban}\n💰 Шилжүүлэх дүн: ${(order.totalPrice||order.price)?.toLocaleString()}₮\n📝 Утга: өөрийн Facebook нэр + утасны дугаар\n\nШилжүүлсний дараа баримтаа screenshot хийж илгээнэ үү 📸`
    );
    return;
  }

  if (!userConversations[senderId]) userConversations[senderId] = [];
  userConversations[senderId].push({ role: "user", content: text });
  if (userConversations[senderId].length > 40) {
    userConversations[senderId] = userConversations[senderId].slice(-40);
  }

  const reply = await getClaudeReply(senderId);
  const awaitMatch = reply.match(/###AWAITING_PAYMENT###(.+?)###END###/s);
  if (awaitMatch) {
    try {
      const orderData = JSON.parse(awaitMatch[1]);
      orderData.label = generateLabel(orderData);
      userStates[senderId] = { awaitingPayment: true, order: orderData };
      const cleanReply = reply.replace(/###AWAITING_PAYMENT###.+?###END###/s, "").trim();
      if (cleanReply) await sendText(senderId, cleanReply);
      await sendText(senderId,
        `💳 Төлбөрийн мэдээлэл:\n\n🏦 Банк: ${BANK_INFO.bank}\n💳 Дансны дугаар: ${BANK_INFO.account}\n👤 Нэр: ${BANK_INFO.owner}\n🔢 IBAN: ${BANK_INFO.iban}\n💰 Шилжүүлэх дүн: ${(orderData.totalPrice||orderData.price)?.toLocaleString()}₮\n📝 Утга: өөрийн Facebook нэр + утасны дугаар\n\nШилжүүлсний дараа баримтаа screenshot хийж илгээнэ үү 📸`
      );
      userConversations[senderId].push({ role: "assistant", content: cleanReply });
    } catch(e) { console.error("Parse алдаа:", e); }
    return;
  }

  const cleanReply = reply.replace(/###AWAITING_PAYMENT###.+?###END###/s, "").trim();
  await sendText(senderId, cleanReply);
  userConversations[senderId].push({ role: "assistant", content: cleanReply });
}

async function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;

  switch (payload) {
    case "GET_STARTED":
      delete adminTakenOver[senderId];
      userConversations[senderId] = [];
      await sendText(senderId, "Сайн байна уу! 👋 Boroldoi AI Studio-д тавтай морилно уу!\n\nТа хэдэн хүнтэй зураг хийлгэх вэ?");
      userConversations[senderId].push({ role: "assistant", content: "Сайн байна уу! Та хэдэн хүнтэй зураг хийлгэх вэ?" });
      break;

    case "ORDER_START":
      delete adminTakenOver[senderId];
      userConversations[senderId] = [];
      await sendText(senderId, "🎨 Зураг захиалах хэсэгт тавтай морилно уу!\n\nТа хэдэн хүнтэй зураг хийлгэх вэ?\n\n💰 Үнэ:\n1 хүн – 30,000₮\n2 хүн – 50,000₮\n3 хүн – 70,000₮\n4 хүн – 100,000₮\n5 хүн – 130,000₮\n...\n\nТоог бичнэ үү:");
      userConversations[senderId].push({ role: "assistant", content: "Зураг захиалах. Хэдэн хүн?" });
      break;

    case "VIEW_PRICES":
      delete adminTakenOver[senderId];
      await sendText(senderId, "💰 ҮНЭ ЖАГСААЛТ\n\n🖼️ ЗУРАХ ҮНЭ:\n1 хүн – 30,000₮\n2 хүн – 50,000₮\n3 хүн – 70,000₮\n4 хүн – 100,000₮\n5 хүн – 130,000₮\n6 хүн – 160,000₮\n7 хүн – 190,000₮\n8 хүн – 220,000₮\n9 хүн – 250,000₮\n10 хүн – 280,000₮\n11 хүн – 310,000₮\n\n⚡ Яаралтай (24-48 цаг): +20%\n📅 Энгийн: 5 хоног\n\n📏 УГААХ + ЖААЗЛАХ:\nA4 – 50,000₮\nA3 – 80,000₮\n\n⚠️ Зурах болон угаах үнэ тус тусдаа");
      break;

    case "OPERATOR":
      adminTakenOver[senderId] = true;
      await sendText(senderId, "🙋 Ажилтантай холбогдож байна, хүлээнэ үү...\n\nУдахгүй манай ажилтан хариулах болно.");
      console.log(`👤 Хэрэглэгч оператор хүслээ → bot унтарлаа → ${senderId}`);
      break;
  }
}

async function handleOrderImage(senderId, imageUrl) {
  if (adminTakenOver[senderId]) return;
  if (!userConversations[senderId]) userConversations[senderId] = [];
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${PAGE_ACCESS_TOKEN}` },
    });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");
    const contentType = imageResponse.headers["content-type"] || "image/jpeg";
    userConversations[senderId].push({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: contentType, data: imageBase64 } },
        { type: "text", text: "Зургаа явуулсан байна" },
      ],
    });
    const reply = await getClaudeReply(senderId);
    const cleanReply = reply.replace(/###AWAITING_PAYMENT###.+?###END###/s, "").trim();
    await sendText(senderId, cleanReply);
    userConversations[senderId].push({ role: "assistant", content: cleanReply });
  } catch(err) {
    console.error("Зураг боловсруулах алдаа:", err.message);
    await sendText(senderId, "Зургийг хүлээн авлаа. Тохиргооны дэлгэрэнгүйг ярилцацгааная.");
  }
}

async function handlePaymentScreenshot(senderId, imageUrl) {
  const order = userStates[senderId].order;
  await sendText(senderId, "⏳ Төлбөрийг шалгаж байна...");
  const result = await verifyPaymentScreenshot(imageUrl, order.totalPrice || order.price);
  if (result.isPayment && result.confirmed) {
    const orderNum = await saveToExcel(order);
    delete userStates[senderId];
    userConversations[senderId] = [];
    await sendText(senderId,
      `✅ Төлбөр баталгаажлаа!\n\n🎉 Захиалга амжилттай бүртгэгдлээ!\n\n📋 Захиалгын дугаар: #${orderNum}\n👤 Нэр: ${order.name}\n📱 Утас: ${order.phone}\n🎨 Зурах: ${order.count ? order.count+" хүн" : "-"}\n${order.washSize ? "✨ Угаах: "+order.washSize+" хэмжээ\n" : ""}⏱️ Хугацаа: ${order.speed==="яаралтай" ? "Яаралтай (24-48 цаг)" : "Энгийн (5 хоног)"}\n💰 Нийт үнэ: ${(order.totalPrice||order.price)?.toLocaleString()}₮\n\nЗураг бэлэн болохоор манайхаас холбогдоно. Баярлалаа! 🎨`
    );
  } else {
    await sendText(senderId,
      `❌ Төлбөр баталгаажуулах боломжгүй байна.\n\nДараахыг шалгана уу:\n• Зураг тодорхой харагдаж байна уу?\n• Шилжүүлсэн дүн зөв байна уу? (${(order.totalPrice||order.price)?.toLocaleString()}₮)\n• Гүйлгээ амжилттай болсон уу?\n\nДахин илгээнэ үү эсвэл оператортой холбогдоно уу.`
    );
  }
}

async function handleComment(commentData) {
  const commenterId = commentData.from?.id;
  const commenterName = commentData.from?.name || "Та";
  if (!commenterId) return;
  userConversations[commenterId] = [];
  delete adminTakenOver[commenterId];
  const greeting = `Сайн байна уу, ${commenterName}! 👋\n\nBoroldoi AI Studio-д тавтай морилно уу! 🎨\n\nТа зураг захиалах эсвэл үнэ лавлахыг хүсэж байна уу?`;
  await sendText(commenterId, greeting);
  userConversations[commenterId].push({ role: "assistant", content: greeting });
}

async function getClaudeReply(senderId) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: userConversations[senderId],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error("Claude API алдаа:", err.response?.data || err.message);
    return "Уучлаарай, түр зуурын алдаа гарлаа. Дахин оролдоно уу.";
  }
}

async function sendText(recipientId, text) {
  try {
    await axios.post(
      "https://graph.facebook.com/v19.0/me/messages",
      { recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" },
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
  } catch (err) {
    console.error("Мессеж илгээх алдаа:", err.response?.data || err.message);
  }
}

app.get("/bot-on", (req, res) => {
  if (req.query.token !== VERIFY_TOKEN) return res.status(403).send("Зөвшөөрөлгүй");
  const userId = req.query.user;
  if (userId) {
    delete adminTakenOver[userId];
    return res.json({ success: true, message: `Bot ${userId}-д дахин асаалаа` });
  }
  Object.keys(adminTakenOver).forEach(k => delete adminTakenOver[k]);
  res.json({ success: true, message: "Бүх bot дахин асаалаа" });
});

app.get("/download", (req, res) => {
  if (req.query.token !== VERIFY_TOKEN) return res.status(403).send("Зөвшөөрөлгүй");
  if (!fs.existsSync(EXCEL_FILE)) return res.status(404).send("Захиалга байхгүй");
  res.download(EXCEL_FILE, "zahialga.xlsx");
});

async function setupPersistentMenu() {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        persistent_menu: [{
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: [
            { type: "postback", title: "🎨 Зураг захиалах", payload: "ORDER_START" },
            { type: "postback", title: "💰 Үнэ мэдэх", payload: "VIEW_PRICES" },
            { type: "postback", title: "👤 Ажилтантай холбогдох", payload: "OPERATOR" },
          ]
        }],
        get_started: { payload: "GET_STARTED" }
      }
    );
    console.log("✅ Persistent Menu тохируулагдлаа!");
  } catch (err) {
    console.error("Menu тохируулах алдаа:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Bot ажиллаж байна: port ${PORT}`);
  await setupPersistentMenu();
});
