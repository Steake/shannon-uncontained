// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';
import { fs, path } from 'zx';

export const displaySplashScreen = async () => {
  try {
    // Get version info from package.json
    // Handle import.meta.dirname being undefined in older Node versions
    const currentDir = import.meta.dirname || new URL('.', import.meta.url).pathname;
    const packagePath = path.join(currentDir, '..', 'package.json');
    const packageJson = await fs.readJSON(packagePath);
    const version = packageJson.version || '1.0.0';

    // Create the main SHANNON ASCII art
    const shannonText = figlet.textSync('SHANNON', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    });

    // Apply golden gradient to SHANNON
    const gradientShannon = gradient(['#F4C542', '#FFD700'])(shannonText);

    // Create minimal tagline with styling
    const tagline = chalk.bold.white('AI Penetration Testing Framework');
    const versionInfo = chalk.gray(`v${version}`);
    const quotes = [
      '☕ COFFEE. CODE. CRACK. ☕',
      '💀 YOUR PASSWORD IS TOO SHORT 💀',
      '🍪 I STOLE YOUR SESSION COOKIES 🍪',
      '💾 127.0.0.1 SWEET 127.0.0.1 💾',
      '🕵️ I KNOW WHAT YOU SEARCHED 🕵️',
      '🚩 ALL YOUR BASE ARE BELONG TO US 🚩',
      '🥪 SUDO MAKE ME A SANDWICH 🥪',
      '💉 SQLI: IT\'S WHAT\'S FOR DINNER 💉',
      '🥩 I EAT BUFFER OVERFLOWS 🥩',
      '🧠 0x41414141 🧠',
      '🔐 JUST PWN IT 🔐',
      '🚀 HACK THE PLANET 🚀',
      '🕶️ I\'M IN. 🕶️',
      '🐇 FOLLOW THE WHITE RABBIT 🐇',
      '💻 THERE IS NO SPOON 💻',
      '🎯 TARGET ACQUIRED 🎯',
      '⚡ EXPLOIT THE UNKNOWN ⚡',
      '🛡️ DEFENSE IS FUTILE 🛡️',
      '🗡️ PRIVACY IS NOT A CRIME, IT\'S A RIGHT 🗡️',
      '🔑 GPG OR DIE TRYING 🔑',
      '🌌 CODE AGAINST THE MACHINE 🌌',
      '⚔️ THE STATE IS THE ENEMY, CRYPTO IS THE WEAPON ⚔️',
      '🦾 TRUST MATH, NOT MONARCHS 🦾',
      '🔇 THE RIGHT TO BE FORGOTTEN IS THE RIGHT TO BE FREE 🔇',
      '🌐 WE ARE THE ANTI-NATION STATES 🌐',
      '💎 DIAMOND HANDS ON ENCRYPTION KEYS 💎',
      '⚡️ LIGHTNING NETWORK OR DEATH ⚡️',
      '🗝️ MY PRIVATE KEY, MY SOVEREIGNTY 🗝️',
      '🔥 BURN THE CERTIFICATE AUTHORITIES 🔥',
      '👁️ ZERO TRUST, ZERO SURRENDER 👁️',
      '💀 DON\'T TRUST, VERIFY. THEN VERIFY AGAIN. 💀',
      '⚙️ THE REVOLUTION WILL BE DECENTRALIZED ⚙️',
      '🕳️ DROP YOUR ZERODAYS LIKE BOMBS 🕳️',
      '🔊 THE CYPHERPUNKS WRITE CODE. LOUDLY. 🔊',
      '💣 FOR EVERY SURVEILLANCE CAMERA, A STRING OF PYTHON 💣',
      '🛰️ MY NODE IS MY CASTLE 🛰️',
      '🧨 TOR IS NOT ILLEGAL, BUT YOU SHOULD BE 🧨',
      '🗺️ MIGRATE TO THE DARKNET, CITIZEN 🗺️',
      '💸 MONEY IS BROKEN, BITCOIN IS THE PATCH 💸',
      '🔪 CUT THE WIRES, BURN THE LOGS 🔪',
      '🌪️ CHAOS IS A LADDER. CLIMB IT. 🌪️',
      '⚗️ DISTILLING TRUTH FROM GOVERNMENT LIES ⚗️',
      '🛠️ SMASH THE PANOPTICON WITH CODE 🛠️',
      '🎭 ANONYMITY IS THE ULTIMATE ACT OF DEFIANCE 🎭',
      '🧬 MUTATE, ADAPT, ENCRYPT, REPEAT 🧬',
      '⚰️ R.I.P. SNOWDEN\'S PASSPORT ⚰️',
      '🔬 REVERSE ENGINEERING THE SOCIAL CONTRACT 🔬',
      '🌊 THE SEA IS RISING. ENCRYPT EVERYTHING. 🌊',
      '💀 LIVE FREE OR `rm -rf /` 💀',
      '🦅 THE ONLY LAW IS CRYPTOGRAPHY 🦅',
      '🔗 BLOCKCHAIN BEATS BORDERS 🔗',
      '🗡️ THE PEN IS MIGHTY, BUT `:wq!` IS FOREVER 🗡️',
      '☣️ INFORMATION WANTS TO BE FREE. LET IT ESCAPE. ☣️',
      '🌑 WE OPERATE IN THE SHADOWS SO YOU CAN SEE THE LIGHT 🌑',
      '🧪 EXPERIMENTS IN DIGITAL AUTONOMY 🧪',
      '⚖️ YOUR ALGORITHMS OR YOUR LIFE ⚖️',
      '🔪 IF IT\'S NOT END-TO-END ENCRYPTED, IT\'S A POSTCARD 🔪',
      '🏴 FLY THE JOLLY ROGER OVER THEIR DATACENTERS 🏴',
      '🧠 NEUROLINK? MORE LIKE NEURO-SHACKLE 🧠',
      '💣 DDOS THE ESTABLISHMENT 💣',
      '🩸 BLEEDING EDGE FOR A BLEEDING WORLD 🩸',
      '🔓 LOCKPICKS AND LOGIC BOMBS 🔓',
      '🌪️ WHISPER NETWORKS IN A SCREAMING WORLD 🌪️',
      '⚡️ 256-BIT OR FIGHT ⚡️',
      '🗺️ MAPPING THE BACKDOORS THEY DON\'T WANT YOU TO SEE 🗺️',
      '🧬 THE GENOME IS PROPRIETARY. LEAK IT. 🧬',
      '💀 ASSUME BREACH. BECAUSE IT\'S TRUE. 💀',
      '⚰️ BURY THEIR SURVEILLANCE STATE IN SEGFAULTS ⚰️',
      '🔬 FORENSICATING THE CORPORATE LIES 🔬',
      '🦠 THE VIRUS OF TRUTH IN THEIR MAINFRAME VEINS 🦠',
      '⚖️ JUSTICE WEIGHS NOTHING IN CYBERSPACE ⚖️',
      '🗡️ WEAPONIZED WHITESPACE AND POETIC LICENSE 🗡️',
      '🌌 EXFILTRATE TO THE STARS 🌌',
      '🔪 CUT OUT THE MIDDLEMEN. BURN THEIR SERVERS. 🔪',
      '⚰️ DIGITAL GHOSTS HAUNTING THE MACHINE ⚰️'
    ];
    // Random quote selection
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    // Build the complete splash content
    const content = [
      gradientShannon,
      '',
      chalk.bold.cyan('                 ╔════════════════════════════════════╗'),
      chalk.bold.cyan('                 ║') + '  ' + tagline + '  ' + chalk.bold.cyan('║'),
      chalk.bold.cyan('                 ╚════════════════════════════════════╝'),
      '',
      `                            ${versionInfo}`,
      '',
      chalk.bold.yellow('                      ' + randomQuote),
      ''
    ].join('\n');

    // Create boxed output with minimal styling
    const boxedContent = boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
      dimBorder: false
    });

    // Clear screen and display splash
    console.clear();
    console.log(boxedContent);

    // Add loading animation
    const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    return new Promise((resolve) => {
      const loadingInterval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(loadingFrames[frameIndex])} ${chalk.dim('Initializing systems...')}`);
        frameIndex = (frameIndex + 1) % loadingFrames.length;
      }, 100);

      setTimeout(() => {
        clearInterval(loadingInterval);
        process.stdout.write(`\r${chalk.green('✓')} ${chalk.dim('Systems initialized.        ')}\n\n`);
        resolve();
      }, 2000);
    });

  } catch (error) {
    // Fallback to simple splash if anything fails
    console.log(chalk.cyan.bold('\n🚀 SHANNON - AI Penetration Testing Framework\n'));
    console.log(chalk.yellow('⚠️  Could not load full splash screen:', error.message));
    console.log('');
  }
};