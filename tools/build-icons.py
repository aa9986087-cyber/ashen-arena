#!/usr/bin/env python3
"""Builds js/data/icon-set.js: the game's icons (they replace every emoji in the UI).
Sources (open licences):
  game-icons.net  via @iconify-json/game-icons 1.2.4  (CC BY 3.0, by Lorc, Delapouite and contributors)
  Lucide          via @iconify-json/lucide 1.2.154    (ISC)
Usage: python3 tools/build-icons.py <game-icons icons.json> <lucide icons.json>
"""
import json, sys

M = {
'⚔️':(['crossed-swords'],'#e8d9b0'),'🪙':(['two-coins','coins'],'#ffcf40'),'✨':(['sparkles','star-swirl'],'#ffe27a'),
'👁️':(['l:eye'],'#cfe6ff'),'👁':(['l:eye'],'#cfe6ff'),'💀':(['death-skull','skull-crossed-bones'],'#eeeeee'),'🎯':(['bullseye','archery-target'],'#ff6a5a'),
'👑':(['crown','queen-crown'],'#ffcf40'),'🏆':(['trophy-cup','trophy'],'#ffcf40'),'🛡️':(['checked-shield','shield'],'#9fc3ff'),
'🔥':(['flame','fire'],'#ff8a3a'),'🌀':(['vortex','whirlwind'],'#8fd0ff'),'🧨':(['dynamite','bundle-grenade'],'#ff5a3a'),
'⚠️':(['l:triangle-alert','l:alert-triangle'],'#ffcf40'),'⚠':(['l:triangle-alert','l:alert-triangle'],'#ffcf40'),'📺':(['l:tv'],'#cfe6ff'),'🧪':(['test-tubes','potion-ball'],'#7cf0a0'),'⚗️':(['health-potion','round-potion'],'#ff5a6a'),'🃏':(['card-pickup','card-random','card-joker'],'#9fd0ff'),'📰':(['newspaper'],'#ffe2a0'),'🌱':(['sprout','plant-seed'],'#7cf08a'),'🌊':(['big-wave','wave-crest'],'#6fb7ff'),'🔧':(['l:wrench'],'#d0d6de'),'🔤':(['l:languages','l:type'],'#cfe6ff'),'🔊':(['l:volume-2'],'#ffd27a'),'🆕':(['l:sparkles'],'#7cf08a'),
'⏱':(['l:timer'],'#e8e8e8'),'🗑':(['l:trash-2'],'#ff8a7a'),'⚡':(['lightning-helix','power-lightning','lightning-bolt'],'#ffe24a'),
'☠️':(['skull-crossed-bones','death-skull'],'#eeeeee'),'☠':(['skull-crossed-bones','death-skull'],'#eeeeee'),'🩸':(['drop','droplets','bleeding-wound'],'#e0283a'),
'⭐':(['star-formation','l:star'],'#ffd84a'),'★':(['star-formation','l:star'],'#ffd84a'),'🌐':(['l:globe'],'#8fd0ff'),'🤝':(['shaking-hands','handshake'],'#ffd7a0'),
'🏰':(['castle'],'#d9c8a8'),'⏳':(['l:hourglass'],'#ffd27a'),'🔄':(['l:refresh-cw'],'#cfe6ff'),'🗡️':(['plain-dagger','stiletto'],'#e0e6ee'),
'🚪':(['l:door-open'],'#d9b48a'),'💥':(['explosion-rays','burst-blob'],'#ffb04a'),'🔁':(['l:repeat'],'#cfe6ff'),'❤️':(['hearts','heart-plus'],'#ff4a5a'),
'🗺️':(['treasure-map'],'#e8d29a'),'✅':(['l:circle-check','l:check-circle'],'#5ee06a'),'💰':(['cash','money-stack','swap-bag'],'#ffcf40'),
'🏹':(['bow-arrow','pocket-bow'],'#d9b48a'),'🪓':(['battle-axe','wood-axe'],'#d0d6de'),'🔱':(['trident'],'#9fe6ff'),
'🔵':(['c:circle'],'#4f8dff'),'🔴':(['c:circle'],'#ff4f4f'),'🟢':(['c:circle'],'#4fdc6a'),'⭕':(['l:circle'],'#ff6a5a'),
'💨':(['wind-slap','dust-cloud'],'#d8e6f0'),'🌪️':(['tornado'],'#bcd6ea'),'🦶':(['barefoot','foot-trip'],'#ffcfa0'),
'✖':(['l:x'],'#ffffff'),'✖️':(['l:x'],'#ffffff'),'📋':(['l:clipboard'],'#e8e8e8'),'🔒':(['l:lock'],'#ffd27a'),'🦸':(['cape','superhero','hero'],'#ff6a8a'),
'✓':(['l:check'],'#5ee06a'),'⏸':(['l:pause'],'#ffffff'),'🌟':(['star-swirl','stars-stack'],'#ffe24a'),'🎮':(['l:gamepad-2'],'#cfe6ff'),
'✏️':(['l:pencil'],'#ffd27a'),'📱':(['l:smartphone'],'#cfe6ff'),'❄️':(['snowflake-1','snowflake-2'],'#9fe6ff'),'🌑':(['moon','night-sky'],'#9a8fd8'),
'💚':(['hearts'],'#4fdc6a'),'💗':(['heart-beats','hearts'],'#ff7ab0'),'🚀':(['rocket'],'#ff8a5a'),'👟':(['running-shoe'],'#a8d8ff'),'🧲':(['magnet'],'#ff5a5a'),
'🌩️':(['lightning-storm','storm'],'#c9b8ff'),'⛈️':(['lightning-storm','storm'],'#c9b8ff'),'☄️':(['comet-spark','meteor-impact'],'#ff9a4a'),'📘':(['book-cover','open-book'],'#6aa8ff'),
'😤':(['enrage','gritted-teeth','angry-eyes'],'#ff6a4a'),'😡':(['enrage','angry-eyes'],'#ff4a3a'),'💢':(['enrage','spiky-explosion'],'#ff4a3a'),'🐉':(['dragon-head','spiked-dragon-head'],'#7cf0a0'),
'💎':(['cut-diamond','diamond-hard'],'#7fe6ff'),'💣':(['unlit-bomb','bomb'],'#c8c8c8'),'🔨':(['warhammer','thor-hammer'],'#d0d6de'),'🌋':(['volcano'],'#ff7a3a'),
'✦':(['l:sparkle'],'#ffe27a'),'💪':(['biceps','muscle-up'],'#ffbe8a'),'🌳':(['oak','beech'],'#5ec46a'),'♻️':(['l:recycle'],'#5ee06a'),'📅':(['l:calendar'],'#cfe6ff'),
'🐢':(['turtle'],'#7cd08a'),'🧹':(['broom'],'#d9b48a'),'⬆️':(['l:arrow-up'],'#ffffff'),'🧬':(['dna1','dna2'],'#8fe0ff'),'🏁':(['checkered-flag'],'#ffffff'),
'🎁':(['present'],'#ff7a9a'),'📊':(['l:chart-column','l:bar-chart-3'],'#8fd0ff'),'🙂':(['l:smile'],'#ffd84a'),'☑️':(['l:square-check','l:check-square'],'#5ee06a'),
'➕':(['l:plus'],'#cfe6ff'),'❌':(['l:circle-x','l:x-circle'],'#ff5a50'),'🍖':(['meat','ham-shank'],'#e0906a'),'🎲':(['rolling-dices','dice-six-faces-five'],'#ffffff'),
'✳️':(['l:asterisk'],'#7cf0a0'),'🎖️':(['medal','rank-3'],'#ffcf40'),'🔮':(['crystal-ball'],'#c98aff'),'🥷':(['ninja-head','ninja-mask','hood'],'#9a8fd8'),
'🔭':(['l:telescope'],'#cfe6ff'),'🧱':(['brick-wall','stone-wall'],'#d97a5a'),'🌬️':(['wind-slap','whirlwind'],'#d8e6f0'),'💫':(['star-swirl','sparkles'],'#ffe27a'),
'🔆':(['sun'],'#ffd84a'),'🪖':(['brodie-helmet','visored-helm'],'#a8b088'),'🕊️':(['dove','peace-dove'],'#ffffff'),'🌵':(['cactus'],'#5ec46a'),
'🧛':(['vampire-dracula','fangs'],'#d04a5a'),'↩️':(['l:undo-2','l:undo'],'#cfe6ff'),'🛸':(['ufo','flying-saucer'],'#9fe6ff'),'⚰️':(['coffin'],'#b08a6a'),
'🌠':(['comet-spark'],'#ffe27a'),'📌':(['l:pin'],'#ff5a5a'),'🔶':(['c:diamond'],'#ff9a3a'),'🔷':(['c:diamond'],'#4f9dff'),'🧊':(['ice-cube'],'#9fe6ff'),
'👊':(['punch','fist'],'#ffbe8a'),'🪨':(['stone-pile','rock'],'#b8b0a8'),'🍀':(['clover','four-leaf-clover'],'#5ec46a'),'🔌':(['l:plug'],'#d0d0d0'),
'🥶':(['frozen-body','frozen-orb','snowflake-2'],'#9fe6ff'),'💠':(['crystal-cluster','crystal-growth'],'#7fe6ff'),'🐾':(['paw-print','paw'],'#d9b48a'),
'🔪':(['bowie-knife','knife-thrust'],'#e0e6ee'),'👥':(['l:users'],'#cfe6ff'),'🎳':(['bowling-strike','bowling-pin'],'#ffffff'),'😈':(['devil-mask','imp-laugh'],'#c06aff'),
'😇':(['angel-outfit','angel-wings'],'#ffe9a0'),'🗼':(['watchtower','lighthouse'],'#d9c8a8'),'👻':(['ghost'],'#e8f0ff'),'🌨️':(['snowing'],'#cfe6ff'),'⛲':(['fountain'],'#8fd0ff'),
'🎐':(['bell-shield','l:bell'],'#9fe6ff'),'🌌':(['galaxy'],'#b08aff'),'🦅':(['eagle-emblem','eagle-head'],'#d9b48a'),'⏩':(['l:fast-forward'],'#cfe6ff'),
'🎆':(['fireworks','firework-rocket'],'#ff8adf'),'🏺':(['amphora'],'#d98a5a'),'🗿':(['moai','stone-bust'],'#b8b0a8'),'🔫':(['pistol-gun','revolver'],'#c8c8c8'),
'🪄':(['fairy-wand','magic-wand'],'#c98aff'),'🔗':(['l:link','chain'],'#cfe6ff'),'✴️':(['spiky-explosion','star-swirl'],'#ff9a4a'),'⚜️':(['fleur-de-lys'],'#ffcf40'),
'⚒️':(['hammer-nails','mining'],'#d0d6de'),'🎭':(['drama-masks','carnival-mask'],'#ffd27a'),'👍':(['l:thumbs-up'],'#ffd84a'),'🎥':(['l:video'],'#cfe6ff'),
'📜':(['scroll-unfurled'],'#e8d29a'),'⚙️':(['l:settings'],'#d0d6de'),'💬':(['l:message-circle'],'#cfe6ff'),'🖼️':(['l:image'],'#cfe6ff'),
}

SHAPES = {
    'circle': '<circle cx="12" cy="12" r="9" fill="currentColor"/>',
    'diamond': '<path fill="currentColor" d="M12 2l10 10l-10 10L2 12z"/>',
}


def main():
    gj = json.load(open(sys.argv[1]))
    lj = json.load(open(sys.argv[2]))
    G, L, LA = gj['icons'], lj['icons'], lj.get('aliases', {})
    svg, out = {}, {}
    for e, (cands, col) in M.items():
        key = None
        for c in cands:
            if c.startswith('c:'):
                key = c
                svg[key] = [24, SHAPES[c[2:]]]
            elif c.startswith('l:'):
                n = c[2:]
                n = n if n in L else LA.get(n, {}).get('parent')
                if n in L:
                    key = 'l:' + n
                    svg[key] = [24, L[n]['body']]
            elif c in G:
                key = 'g:' + c
                svg[key] = [512, G[c]['body']]
            if key:
                break
        if not key:
            sys.exit('no icon for ' + e)
        out[e.replace('\ufe0f', '')] = [key, col]
    with open('js/data/icon-set.js', 'w') as f:
        f.write("'use strict';\n/* Generated by tools/build-icons.py. Icons: game-icons.net (CC BY 3.0) and Lucide (ISC). */\n")
        f.write('const ICON_SVG = ' + json.dumps(svg, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('const ICON_MAP = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(len(out), 'emojis →', len(svg), 'icons')


main()
