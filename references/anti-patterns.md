# Anti-patterns

Each rule here comes from something that actually went wrong. Add a new entry every time a game is rejected, with the reviewer's words when there are any. The agent reads this before designing.

## Rendering

- **AgX tone mapping on the accent.** Style Lab v1 used `AgXToneMapping`; the signal orange `#FF5A1F` came out salmon-pink and the brand disappeared. Use `NeutralToneMapping`, which keeps hues.
- **Bloom on everything light.** With a bloom threshold below 1, every clay part, the ruler strip and steel highlights glowed like neon. Bloom threshold stays above 1; only semantic overlays are HDR-boosted (`color.multiplyScalar(1.8–2.6)`, `toneMapped: false`) so they are the only things that glow.
- **One exposure for all looks.** Paper blew out under the Bench lighting. Each look sets its own exposure, environment, key, hemisphere, bloom strength and bloom threshold (Paper: exposure 0.82, threshold 1.6).
- **Light parts as "bench detail".** A ruler strip in light clay read as a light source. Bench-level detail uses graphite tones; light materials are reserved for the subject.
- **Too much light for a dark identity.** Key 2.4 + environment 0.55 turned the graphite bench mid-grey. Bench look: key ≈ 1.5, environment ≈ 0.3, hemisphere ≈ 0.12.

## Overlays and HUD

- **Anchored cards leaving the screen.** The equation card anchored above the motor clipped off the top. Clamp every anchored overlay inside the viewport.
- **Platform chrome covering controls.** A host popover sat over the top-right control panel. Don't put the only copy of an important control in the top-right corner; every control also has a keyboard shortcut.
- **"-0.0" readouts.** Format signed zero as 0.

## Measurement

- **A perf counter that lies.** With post-processing, `renderer.info` reported the last pass (1 draw call). Set `renderer.info.autoReset = false` and reset once per frame before rendering.
- **Shipping over the phone budget.** Style Lab: ~260 draw calls against a budget of 120, mostly because every mesh carries its own edge-line object. Merge static geometry and edge lines by material; instance repeated parts.

## Physics and truth

- **A curb input for a second-order lesson.** Base excitation keeps overshoot at ζ = 1 and makes a stiff damper "settle" instantly at ~10 g, which teaches the wrong thing. Use the textbook-clean input (step force) for the concept being taught, and check the numbers in a script before building the level.

## Interaction

- **Orbit controls stealing the grab.** A drag on a weight orbited the camera. The grab handler must listen to `pointerdown` in the capture phase and call `stopImmediatePropagation()` when it hits a grabbable, so OrbitControls never sees the event.
- **CSS `display` beating `hidden`.** The world map stayed open in the standalone build because `#modal { display: grid }` overrides the `hidden` attribute; the artifact frame's reset hid the bug. The HUD CSS starts with `[hidden]{display:none!important}`.
- **A flickering physical measurement.** At ~20 fps the stacked weights jittered, the hanging load flickered between 4 and 5 Nm, and the motor settled at the wrong speed. Any reading taken from physics is debounced (stable for 0.25 s) before the model sees it, and centring nudges never teleport a resting body every frame.
- **State leaking between levels.** The debounced load from Q4 survived into Q5's spin-up and the motor started below 2500 rpm. Every level reset clears every piece of derived state, including debounce buffers.
- **Hold timers that reset on one bad frame.** A goal that must hold for 1.5 s now decays at twice the rate it fills instead of resetting to zero.

## Testing

- **A bot that depends on frame rate.** Headless Chrome renders on the CPU at a few fps, so wall-clock waits timed out. The playtest bot steps the simulation in fixed 1/60 s ticks and renders once for the screenshot.
- **Wall-clock timers inside a bot solution.** `setTimeout(() => brake(), 300)` never lined up with simulated time. Solutions act instantly.
- **Screenshot coordinates ≠ CSS pixels.** The page was 1920 px wide and the screenshot 1568 px; clicks computed in CSS pixels missed. Scale by `screenshotWidth / innerWidth`.
- **Audio in tests.** The headless browser played the game's sound through the user's speakers. Always launch test browsers with `--mute-audio`.
- **Two functions with the same name in one scope.** `stage.frame` (camera framing) was shadowed by the render loop's own `function frame()`, so calling it silently started a second render loop and never moved the camera. Function declarations hoist; the last one wins. Name helpers for what they do (`frameBox`, `renderLoop`).
