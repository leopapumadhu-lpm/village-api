import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // Create or find user
    const user = await prisma.user.upsert({
      where: { email: "frontend@village-api.local" },
      update: {},
      create: {
        email: "frontend@village-api.local",
        businessName: "Frontend Dashboard",
        passwordHash: "",
        planType: "UNLIMITED",
        status: "ACTIVE",
      },
    });

    console.log("✓ User created/found:", user.email);

    // Create API key
    const apiKey = await prisma.apiKey.upsert({
      where: { key: "ak_frontend_test_key_dev_12345" },
      update: { userId: user.id },
      create: {
        name: "Frontend Dashboard Key",
        key: "ak_frontend_test_key_dev_12345",
        secretHash: "ak_frontend_test_key_dev_12345",
        userId: user.id,
        isActive: true,
      },
    });

    console.log("\n✅ API Key created successfully!");
    console.log("Key:", apiKey.key);
    console.log("\nYou can now use the frontend app!");

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
