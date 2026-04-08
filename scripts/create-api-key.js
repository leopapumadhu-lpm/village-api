import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  try {
    // Create a frontend user
    const user = await prisma.user.create({
      data: {
        email: "frontend@village-api.local",
        businessName: "Frontend Dashboard",
        passwordHash: "", // No password needed for frontend
        planType: "UNLIMITED",
        status: "ACTIVE",
      },
    });

    console.log("✓ Created user:", user.email);

    // Generate API key
    const plainKey = `ak_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        name: "Frontend Dashboard Key",
        key: plainKey,
        secretHash: plainKey, // In production, hash this with bcrypt
        userId: user.id,
        isActive: true,
      },
    });

    console.log("\n✅ API Key created successfully!\n");
    console.log("API Key:", plainKey);
    console.log("\nAdd this to your frontend environment:");
    console.log('VITE_API_KEY=' + plainKey);
    console.log('VITE_API_URL=http://localhost:3000');

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
