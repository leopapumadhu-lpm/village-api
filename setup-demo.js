import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function setupDemo() {
  try {
    // Create demo user
    let demoUser = await prisma.user.findUnique({
      where: { email: "demo@villageapi.com" }
    });

    if (!demoUser) {
      demoUser = await prisma.user.create({
        data: {
          email: "demo@villageapi.com",
          passwordHash: await bcrypt.hash("Demo@123456", 10),
          businessName: "Village API Demo",
          planType: "PREMIUM",
          status: "ACTIVE"
        }
      });
      console.log("✅ Demo user created");
    }

    // Create API key
    let apiKey = await prisma.apiKey.findUnique({
      where: { key: "demo-key-with-daily-limit" }
    });

    if (!apiKey) {
      apiKey = await prisma.apiKey.create({
        data: {
          userId: demoUser.id,
          key: "demo-key-with-daily-limit",
          name: "Demo Key",
          secretHash: await bcrypt.hash("demo-secret", 10),
          isActive: true
        }
      });
      console.log("✅ Demo API key created");
    }

    console.log("✨ Demo ready! Key: demo-key-with-daily-limit");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

setupDemo();
