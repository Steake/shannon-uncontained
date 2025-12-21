/**
 * Scaffold Packs - Index
 */

import { EXPRESS_SCAFFOLD } from './express-scaffold.js';
import { FASTAPI_SCAFFOLD } from './fastapi-scaffold.js';

export { EXPRESS_SCAFFOLD, FASTAPI_SCAFFOLD };

/**
 * Get scaffold by framework name
 * @param {string} framework - Framework name
 * @returns {object|null} Scaffold pack or null
 */
export function getScaffold(framework) {
    const scaffolds = {
        express: EXPRESS_SCAFFOLD,
        fastapi: FASTAPI_SCAFFOLD,
    };
    return scaffolds[framework.toLowerCase()] || null;
}

/**
 * List available scaffolds
 * @returns {string[]} Scaffold names
 */
export function listScaffolds() {
    return ['express', 'fastapi'];
}

