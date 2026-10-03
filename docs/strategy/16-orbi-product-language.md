# Orbi — product language

## Identity

Orbis is the platform. Orbi is the teammate. The main entry point is **Ask Orbi** (not “Ask to Orbi”). Keep the approved landing unchanged.

Use the user-supplied orbital character consistently: welcome in chat, thinking during a real pending operation, confirmation after a successful operation. Do not simulate completed work, progress percentages, or background activity. Avoid guilt, artificial streaks, or celebrating an action that failed.

## Visual workflows

Show inputs and recognizable tool logos → Orbi → intended outputs and human approval. Keep stage details expandable, but preserve their acceptance gates and safety boundaries. A diagram describes the mission plan, not proof that it has run.

Use locally hosted integration logos. Account verification, knowledge scope and action authorization are distinct. Alternatives satisfy one capability (Gmail OR Outlook), not a requirement to connect every tool shown.

## Assets

Original supplied PNGs copied without editing to `public/brand/orbi/`: welcome, thinking, done, team. Pre-sized AVIF/WebP derivatives (64–512 px, `scripts/orbi-assets.mjs`) and a flat SVG mark for ≤ 24 px spots. `Orbi.tsx` is the single character component; `OrbiSays`, `OrbiEmpty` and `OrbiMark` build on it. Placement, moods, motion and voice rules: [docs/design/orbi-mascot.md](../design/orbi-mascot.md). No new generated character art or third-party image calls.

## Current delivery boundary

Connection discovery and server-side verification are implemented for the six configured connector types. Actual credentials are still required. Rental and creator diagrams describe the defined blueprints; they are not autonomous deployed workers. The Hostaway adapter supports a scoped read-only pilot. Production identity enforcement, durable workflow execution and live-account acceptance tests remain required before customer deployment.
