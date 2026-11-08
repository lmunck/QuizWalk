# QuizWalk (Qualk)

Turn any walk into a quiz. Creators generate or write a walk of location-based questions; teams walk to each stop, answer, and compete on a live leaderboard.

- Spec: [`docs/v1-spec.md`](docs/v1-spec.md)
- Design reference: [`design/`](design/README.md)

Stack: Expo (React Native + TypeScript) for iOS and Android · Firebase (Firestore, Auth, Cloud Functions, Hosting) · OpenRouteService · OpenStreetMap + Wikipedia.

## Development

Node 22 and npm workspaces (`app`, `functions`, `shared`, `rules-tests`).

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Setup status and remaining M0 steps: [`docs/m0-setup.md`](docs/m0-setup.md).
