# Setup Interviewed

\`\`\`bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
\`\`\`

## Docker Setup

\`\`\`bash
docker-compose up -d
\`\`\`

## Database

\`\`\`bash
npm run prisma:migrate
npm run prisma:seed
\`\`\`
