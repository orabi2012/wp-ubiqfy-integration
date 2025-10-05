/**
 * Store data initialization utilities
 * Handles server-side data initialization for client-side JavaScript
 */

/**
 * Initialize store data from server-side variables
 * @param {object} storeData - The store data object from server
 */
function initializeStoreData(storeData) {
    // Make store data available globally
    window.storeData = storeData;

    // Toggle environment classes for sandbox awareness
    const isSandbox = !!storeData?.ubiqfy_sandbox;
    const root = document.documentElement;
    if (root) {
        if (isSandbox) {
            root.setAttribute('data-environment', 'sandbox');
        } else {
            root.removeAttribute('data-environment');
        }
    }

    if (document.body) {
        document.body.classList.toggle('sandbox-environment', isSandbox);
    }

    // Dispatch a custom event to notify other scripts that store data is ready
    const event = new CustomEvent('storeDataReady', { detail: storeData });
    document.dispatchEvent(event);
}

/**
 * Get current store data
 * @returns {object|null} The current store data or null if not initialized
 */
function getStoreData() {
    return window.storeData || null;
}

/**
 * Wait for store data to be ready
 * @returns {Promise<object>} Promise that resolves with store data when ready
 */
function waitForStoreData() {
    return new Promise((resolve) => {
        if (window.storeData) {
            resolve(window.storeData);
        } else {
            document.addEventListener('storeDataReady', function (event) {
                resolve(event.detail);
            }, { once: true });
        }
    });
}

// Export functions for global access
window.initializeStoreData = initializeStoreData;
window.getStoreData = getStoreData;
window.waitForStoreData = waitForStoreData;
