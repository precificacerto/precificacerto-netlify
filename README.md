This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## This project use firebase, into env file exists this infos

NEXT_PUBLIC_FIREBASE_API_KEY=**********

NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=**********

NEXT_PUBLIC_FIREBASE_PROJECT_ID=**********

NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=**********

NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=**********

NEXT_PUBLIC_FIREBASE_APP_ID=**********

## This project use firebase-admin too

To execute local need create a file called credential.json

## Links to projects
Google Cloud Plataform: https://console.cloud.google.com/run?project=precifica-certo-fb

Firebase: https://console.firebase.google.com/project/precifica-certo-fb/overview

RD Station: https://app.rdstation.com.br/home

## Docker

Official doc: https://github.com/vercel/next.js/tree/canary/examples/with-docker

Comands: 

- ```Build your container: docker build -t nextjs-docker .```
- ```Run your container: docker run -p 3000:3000 nextjs-docker```


