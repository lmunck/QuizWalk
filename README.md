# QuizWalk (Qualk)

Turn any walk into a quiz. Creators generate a walk from the map, or build one by hand; teams walk to each stop, answer, and compete on a live leaderboard.

- Spec: [`docs/v1-spec.md`](docs/v1-spec.md)
- Design reference: [`design/`](design/README.md)
- M1 architecture: [`docs/m1-design.md`](docs/m1-design.md)
- M4 generation design: [`docs/m4-generation-design.md`](docs/m4-generation-design.md)
- Implementation plan: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- M1 delivery notes: [`docs/m1-delivery.md`](docs/m1-delivery.md)
- M2 wrap-up and M3 delivery notes: [`docs/m2-m3-delivery.md`](docs/m2-m3-delivery.md)
- M4 backend delivery notes: [`docs/m4-backend-delivery.md`](docs/m4-backend-delivery.md)
- M2–M5 handover, with your to-do list: [`docs/m2-m5-handover.md`](docs/m2-m5-handover.md)
- How to test, locally and on phones: [`docs/user-testing.md`](docs/user-testing.md)

Stack: Expo (React Native + TypeScript) for iOS and Android · Firebase (Firestore, Auth, Cloud Functions, Hosting) · OpenRouteService · OpenStreetMap + Wikipedia · Gemini API.

The question bank is filled and reviewed with `npx tsx scripts/fill-bank.ts` and `npx tsx scripts/review-bank.ts` (see their headers).

## Development

Node 22 and npm workspaces (`app`, `functions`, `shared`, `rules-tests`).

```bash
npm install
npm run typecheck && npm run lint && npm test
```

```bash
npm run test:rules && npm run test:functions
```

The last two start the Firestore emulator (Java 21+). Running the app locally against the
emulators: [`docs/user-testing.md`](docs/user-testing.md) part 1.

Setup status and remaining M0 steps: [`docs/m0-setup.md`](docs/m0-setup.md).
