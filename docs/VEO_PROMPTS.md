# Maruthi Timber Depot — cinematic video prompts (Google AI Studio · Veo)

Generate each clip in **Google AI Studio → Veo** (use the highest-quality Veo model your plan offers).

**Settings for every clip**
- Aspect ratio **16:9**, resolution **1080p**, duration **8 s** (audio is not needed — the website plays clips muted)
- After the 16:9 clips, make a **9:16** version of `hero` for phones
- Paste the **negative prompt** below into the negative-prompt box (or add it at the end as "Avoid: …")

**Negative prompt (all clips)**
```
cartoon, animation, CGI look, 3D render, low-poly, plastic, toy, illustration, painting, text, captions, subtitles, logos, watermark, people's faces, extra or bent saw blades, warped wood, melting textures, flicker, oversaturated colours, black background, night
```

**Save the files here** (exact names):
`C:\Users\K S Indra Kumar\projects\MaruthiTimberDepo\public\landing\video\`
→ `hero.mp4`, `saw.mp4`, `grain.mp4`, `yard.mp4`, `door.mp4` (and `hero-portrait.mp4` for the 9:16 one)

---

## 1 · MASTER PROMPT — opening hero (`hero.mp4`)
```
Photorealistic cinematic live-action footage, shot on an ARRI Alexa 35 with anamorphic lenses, 24 fps, shallow depth of field, real-world physics, gentle film grain. Location: a traditional timber depot and sawmill yard in Karnataka, South India, at golden hour.

A slow, steady gimbal dolly at knee height glides forward along a long stack of massive, freshly cut teak logs (each about 2 feet across and 14 feet long). The camera passes the log ends one by one, revealing rich concentric growth rings, honey-gold heartwood, a pale cream sapwood band, small radial drying cracks, faint saw marks, and thick, rough, dark-brown bark with patches of green moss. Low warm sunlight streams through a light haze from behind the stack, creating volumetric god rays; fine golden sawdust particles float and glitter in the beams. Softly out of focus in the background: tall teak and coconut trees, a red-tiled sawmill shed, neat stacks of seasoned planks. The move ends with the largest log end filling the right half of the frame in crisp focus, leaving calm open space on the left. Warm amber, teak-brown and soft leaf-green palette, natural contrast, premium and majestic mood. Seamless, loop-friendly motion.
```

## 2 · The saw (`saw.mp4`)
```
Photorealistic cinematic slow-motion close-up in a traditional South Indian sawmill. A large industrial circular saw blade (about 36 inches, brushed steel, sharp set teeth) spins and slices lengthwise through a golden teak log riding on a steel sawmill carriage. A thick arc of golden sawdust sprays out, backlit by low evening sun streaming through the open side of the shed, forming glowing volumetric rays. The fresh cut face reveals bright golden-brown grain. The camera tracks slowly alongside the blade at a 45-degree angle, shallow depth of field, specular glints on the steel. 120 fps slow motion, ARRI Alexa look, warm amber palette, real-world physics, no people visible.
```

## 3 · The grain (`grain.mp4`)
```
Photorealistic macro cinematography. A 100 mm macro lens glides slowly across the surface of a freshly planed teak plank, revealing flowing golden grain, darker streaks and a natural oil sheen. A soft beam of warm light sweeps across the wood from left to right, making the grain shimmer with chatoyance. A few thin curled wood shavings lie in the soft-focus foreground. Ultra detailed, very shallow depth of field, warm honey and amber tones, calm and luxurious mood.
```

## 4 · The seasoning yard (`yard.mp4`)
```
Photorealistic aerial drone footage at sunset. The drone rises slowly and pulls back over a timber depot in Karnataka: neatly stacked seasoning piles of sawn teak and sal planks separated by thin wooden stickers, rows of round logs, a sawmill shed with a red-tiled roof, a small truck loaded with timber, surrounded by green trees and palms. Long warm shadows, orange-gold sunlight, a gentle haze, birds crossing in the distance. Smooth cinematic ascent, real-world scale and detail.
```

## 5 · The finished door (`door.mp4`)
```
Photorealistic cinematic close-up inside a warm Indian home entrance. A craftsman's hand with a soft cloth applies clear varnish to an intricately carved solid teak main door with brass handles and studs. Slow push-in as the polish brings out a deep golden lustre and flowing grain; soft daylight from a side window, gentle reflections on the glossy surface, dust motes drifting in the light. Elegant, premium, heirloom craftsmanship, shallow depth of field, warm palette. Only the hand is visible, no face.
```

## 6 · Phone version (`hero-portrait.mp4`, 9:16)
Use the master prompt (1) with aspect ratio **9:16**, and change the last sentence to:
```
The move ends with the largest log end centred in the lower half of the frame in crisp focus, leaving calm open sky and haze in the upper half.
```

## 7 · Species cards (optional, one per species, `species-<name>.mp4`, 16:9, 8 s)
Replace `[SPECIES]` and `[LOOK]` from the list below:
```
Photorealistic macro product cinematography on a warm neutral backdrop. A single freshly planed board of [SPECIES] wood rotates very slowly on a turntable while a soft warm light sweeps across it, revealing [LOOK]. The board's end shows clear growth rings. 100 mm macro lens, shallow depth of field, studio-quality lighting with a gentle golden rim light, ultra detailed, premium and calm.
```
- Ghana Teak — golden-brown body with darker straight streaks and a natural oily sheen
- Burma Teak — deep golden lustre, tight even grain, rich oil content
- Nilambur Teak — warm honey colour with fine tight grain
- Sal — heavy reddish-brown wood with interlocked coarse grain
- Honne (Pterocarpus marsupium) — reddish-gold wood with flowing figure
- Rosewood (Dalbergia latifolia) — deep purple-brown with near-black streaks
- Matti (Terminalia) — dark greyish-brown with bold grain
- Halasu / Jackfruit — bright yellow-orange wood mellowing to amber
- Silver Oak — pinkish-tan wood with silvery ray flecks
- Pine — pale cream-yellow wood with small dark knots

Tip: generate 2–3 takes of the master prompt and keep the most realistic one (sharp rings, no warped bark, steady camera).
