# Motion

Motion clarifies state changes and gives the private portal a calm, engineered feel. It must never delay a control-plane request or make upload progress look more advanced than the confirmed bytes.

## Principles

- Login and completion use short entrance choreography only.
- Upload rows animate when entering or leaving; progress itself is driven by confirmed transfer bytes.
- Drag-over emphasis and button feedback are brief and reversible.
- Background atmosphere is subordinate to the interface. Beams pause in hidden tabs and reduce to a static frame for users who request reduced motion.
- No scroll hijacking, parallax, layout thrashing, or decorative timers are used to imply transfer progress.

## Performance budget

- CSS handles simple transitions and reduced-motion overrides.
- The supplied Beams canvas is capped to a small beam count, a maximum device-pixel ratio of 2, and a bounded blur radius.
- The animation loop is cancelled when the document is hidden or the component unmounts.
- Upload rows do not run layout animation on every progress update.

## Reduced motion

`prefers-reduced-motion: reduce` disables spatial choreography, hover translation, drag translation, canvas animation, and looping background opacity animation while preserving immediate state changes and progress visibility.

## Review checklist

- Does motion explain a state transition?
- Can the user act without waiting for it?
- Does the same state remain understandable with motion disabled?
- Is the effect outside the content’s reading and interaction path?
- Does the browser stop doing work when the tab is hidden?
