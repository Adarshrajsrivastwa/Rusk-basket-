/**
 * Builds API_REFERENCE.txt from API_FIELDS_REFERENCE.md
 * (method + path + one-line "work" + all validator fields)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "API_FIELDS_REFERENCE.md");
const out = path.join(root, "API_REFERENCE.txt");

function describeWork(method, routePath) {
  const p = routePath;
  const lower = p.toLowerCase();
  const pick = (s) => s;

  if (lower.includes("verify-otp") || lower.includes("verify_login_otp") || lower.includes("verify-login-otp")) {
    return pick("OTP verify karke session/token banta hai.");
  }
  if (lower.includes("send-otp") || (lower.includes("/login") && method === "POST" && !lower.includes("logout"))) {
    return pick("Login flow: OTP bhejta / start karta hai.");
  }
  if (lower.includes("logout")) {
    return pick("Session logout / token hatao.");
  }
  if (lower.endsWith("/fcm-token") || lower.includes("fcm-token")) {
    return pick("Push notification ke liye FCM device token save/update.");
  }
  if (lower.includes("notification")) {
    if (method === "GET" && lower.includes("unread-count")) {
      return pick("Unread notification count.");
    }
    if (method === "GET") {
      return pick("Notification list (pagination/filters).");
    }
    if (method === "PATCH" || (method === "PUT" && lower.includes("read"))) {
      return pick("Notification ko read mark karo.");
    }
    if (method === "DELETE") {
      return pick("Notification(s) hatao.");
    }
  }
  if (lower.includes("withdrawal") && lower.includes("approve")) {
    return pick("Withdrawal request approve karo.");
  }
  if (lower.includes("withdrawal") && lower.includes("reject")) {
    return pick("Withdrawal request reject karo (reason).");
  }
  if (lower.includes("callback")) {
    return pick("Payment gateway callback (IPN) handle.");
  }
  if (lower.includes("invoice") && lower.includes("pdf")) {
    return pick("Invoice PDF download / generate.");
  }
  if (
    method === "GET" &&
    (/\/:id$/.test(p) || /\/:ticketId$/.test(p) || /:orderId/.test(p) || /:orderNumber/.test(p) || /:invoiceId/.test(p) || /:requestId/.test(p) || /:applicationId/.test(p) || /:notificationId/.test(p) || /:gatewayId/.test(p) || /:productId$/.test(p))
  ) {
    return pick("Ek record detail ID se.");
  }
  if (method === "GET" && (lower.includes("list") || (lower.endsWith("s") && !p.includes(":")))) {
    return pick("List + filters / pagination.");
  }
  if (method === "POST" && (lower.includes("create") || lower.includes("/add"))) {
    return pick("Naya record create karo.");
  }
  if (method === "PUT" || method === "PATCH") {
    if (lower.includes("status")) {
      return pick("Status update.");
    }
    return pick("Record update (fields).");
  }
  if (method === "DELETE") {
    return pick("Record delete.");
  }
  if (method === "POST" && lower.includes("message")) {
    return pick("Ticket par message bhejo.");
  }
  if (method === "GET") {
    return pick("Data read (query filters ho sakte hain).");
  }
  if (method === "POST") {
    return pick("Action / submit (body fields).");
  }
  return pick(`${method} — REST resource operation.`);
}

function main() {
  const raw = fs.readFileSync(src, "utf8");
  const lines = raw.split(/\r?\n/);

  const header = [
    "================================================================================",
    "  API REFERENCE (single file) — Rusk Basket backend",
    "  Har route: KAAM (work) + saare request fields (param/query/body)",
    "  Source: express-validator se auto API_FIELDS_REFERENCE.md, phir yeh .txt",
    "================================================================================",
    "",
    "Legend: param = URL path, query = ?string, body = JSON/form fields",
    "  Nested: dot notation (e.g. items.*.productId = array of objects)",
    "",
  ];

  const outLines = [...header];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ") && !line.startsWith("### ")) {
      const g = line.replace(/^##\s+/, "").trim();
      outLines.push("--------------------------------------------------------------------------------");
      outLines.push(`  ${g}`);
      outLines.push("--------------------------------------------------------------------------------");
      outLines.push("");
      i++;
      continue;
    }

    const m = line.match(/^###\s+(GET|POST|PUT|PATCH|DELETE)\s+`(.+)`\s*$/);
    if (m) {
      const method = m[1];
      const routePath = m[2];
      i++;
      const fieldLines = [];
      while (i < lines.length && !lines[i].startsWith("### ")) {
        if (lines[i].startsWith("## ") && !lines[i].startsWith("### ")) {
          break;
        }
        const L = lines[i].trim();
        if (L && !L.startsWith("#")) {
          const plain = L
            .replace(/^\-\s+/, "  - ")
            .replace(/\*\*(param|query|body):\*\*/g, (_, k) => `${k}:`);
          if (!plain.startsWith("  - ")) {
            fieldLines.push(plain);
          } else {
            fieldLines.push(plain);
          }
        }
        i++;
      }

      outLines.push(`${method} ${routePath}`);
      outLines.push(`  Kaam (work): ${describeWork(method, routePath)}`);
      if (fieldLines.length) {
        outLines.push("  Fields:");
        fieldLines.forEach((f) => outLines.push(f));
      } else {
        outLines.push("  Fields: (no express-validator list — middleware / multipart only possible)");
      }
      outLines.push("");
      continue;
    }

    if (line.trim().startsWith("Also mounted at") || line.trim().startsWith("*Generated by")) {
      outLines.push(line);
      outLines.push("");
    }

    i++;
  }

  outLines.push("================================================================================");
  outLines.push("End of file");
  outLines.push("================================================================================");

  fs.writeFileSync(out, outLines.join("\n"), "utf8");
  console.log("Wrote", out);
}

main();
