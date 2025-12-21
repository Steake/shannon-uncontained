/**
 * Scaffold Packs - Index
 */

export { EXPRESS_SCAFFOLD } from './express-scaffold.js';
export { FASTAPI_SCAFFOLD } from './fastapi-scaffold.js';

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
