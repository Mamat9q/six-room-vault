# SIX-ROOM VAULT — Blueprint Heist

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Mamat9q/six-room-vault/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Mamat9q/six-room-vault/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![License: MIT](https://img.shields.io/badge/License-MIT-ffd166)](LICENSE)

A complete original top-down stealth heist game for the make.fun **best-heist-game** bounty.
Six connected rooms — Lobby, Gallery, Server Room, Vault Corridor, the Vault, Rooftop — drawn
as one blueprint floor plan, so every frame shows the whole job: the room the thief is crossing,
guards with vision cones, sweeping cameras, a loot target, and the alarm meter.

## The job

Steal the Vellum Idol from the Vault, then reach the rooftop helipad before the 5:00 clock runs
out. Getting caught ends the run; never being seen pays a $500 ghost bonus.

- **3 guard types, distinct behaviour.** Patrollers walk waypoint loops, sentries stand and sweep
  a narrow cone, the runner chases on alarm. All three investigate the last place they saw you.
- **3 sweeping cameras** with visible cones. An EMP burst knocks them all offline for 8 seconds.
- **Multi-stage alarm.** Calm → suspicion (guards investigate) → lockdown at 75 (every door
  seals for 8 seconds and the guards hunt). The meter decays while you stay hidden.
- **Priced tools, bought with loot.** Lockpick $150, EMP burst $250, disguise $300, smoke bomb
  $150, noise maker $100 — every purchase trades score against survival.
- **Tiered loot.** Coins $50, art and data $150, vault cash $200, the Idol $500. Time left pays
  $10 a second on a clean getaway.
- **Six rooms, two locked doors.** The Gallery→Vault door needs a lockpick; the Vault→Rooftop
  exit opens only once the Idol is in hand.

## Controls

WASD / arrows move · Shift sneak (slower, harder to spot) · 1–5 buy and use tools ·
P / Esc pause · R restart after the job ends · M mute · mouse click starts.

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Static files only — `game/index.html` opens in desktop Chrome and plays with no network
request. All sound is synthesised WebAudio; there are no media files.

## Method

Fixed 1/60 s simulation, seeded and deterministic: the same seed replays the same game, which
is how the four screenshots are staged (`?shot=title|gallery|vault|escape&seed=1` — see
`shots.json`). Vision is a fan of rays marched against the wall rectangles, so each cone is
drawn exactly where it can see. Tuning lives in one place, `game/src/config.js`, with named
constants and measured numbers per variant in `NOTES.md`.

## Layout

```
main.ts                  the entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
vendor/makefun-game.ts   the kit's dossier library, unchanged
game/index.html          the game shell
game/src/config.js       all tuning + the six-room floor plan
game/src/world.js        simulation: movement, vision, guards, cameras, alarm, tools, win/lose
game/src/render.js       blueprint-noir renderer + HUD
game/src/input.js        keyboard + mouse
game/src/audio.js        synthesised WebAudio blips
game/src/shots.js        screenshot staging (autopilot plays the real rules)
game/src/random.js       seeded RNG
game/src/main.js         boot + the one loop
screenshots/             4 real renders of the game's own code, 1280x480
```

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=fktnkc1k&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
