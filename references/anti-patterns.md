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
