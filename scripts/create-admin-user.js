import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  try {
    // Create test admin user
    const email = "admin@villageapi.com";
    const password = "Admin@123456";
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, status: "ACTIVE" },
      create: {
        email,
        businessName: "Village API Admin",
        passwordHash,
        planType: "UNLIMITED",
        status: "ACTIVE",
      },
    });

    console.log("✅ Admin user ready!");
    console.log("\nLogin credentials:");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("\nAdmin ID:", user.id);

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
