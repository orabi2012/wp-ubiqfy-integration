/**
 * Sync page JavaScript functionality
 * Handles product fetching and synchronization with wp
 */

// Global variables (will be initialized by the template)
let storeId, conversionRate, wpCurrency, ubiqfyCurrency;

// Initialize the page
document.addEventListener('DOMContentLoaded', function () {
    // Initialize option checkbox visual states
    initializeOptionCheckboxStates();

    // Note: loadCachedProducts() will be called from initializeStoreData() 
    // after store data is available from the template

});

// Listen for store data ready event
document.addEventListener('storeDataReady', function (event) {
    const storeData = event.detail;
    // Initialize global variables
    storeId = storeData.id;
    conversionRate = storeData.currency_conversion_rate;
    wpCurrency = storeData.wp_currency;
    ubiqfyCurrency = storeData.ubiqfy_currency;
});

/**
 * Initialize store data from server-side variables
 */
function initializeStoreData(storeData) {
    const oldConversionRate = window.storeData?.currency_conversion_rate;

    window.storeData = storeData;
    storeId = storeData.id;
    conversionRate = storeData.currency_conversion_rate;
    wpCurrency = storeData.wp_currency;
    ubiqfyCurrency = storeData.ubiqfy_currency;

    // If conversion rate changed, recalculate markups for existing options
    if (oldConversionRate && oldConversionRate !== conversionRate) {
        if (typeof recalculateAllMarkupsForCurrencyChange === 'function') {
            recalculateAllMarkupsForCurrencyChange();
        }
    }

    // Auto-load cached products after store data is initialized
    // Add small delay to ensure all scripts are loaded
    setTimeout(() => {
        loadCachedProducts();
    }, 100);
}

/**
 * Initialize visual states for all option checkboxes
 */
function initializeOptionCheckboxStates() {
    // Wait a bit for the DOM to be fully loaded
    setTimeout(() => {
        updateSelectedCountWrapper();
    }, 100);
}

/**
 * Filter products based on search input
 * Searches in:
 * - Product names (card titles)
 * - Product codes (text elements and data attributes)
 * - Product option names
 * - Product option codes (text elements and data attributes)
 * - Country badges
 */
function filterProducts() {
    const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
    const productCards = document.querySelectorAll('.col-12.mb-4');

    let visibleCount = 0;
    productCards.forEach(card => {
        const productName = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
        const productCode = card.querySelector('.text-muted')?.textContent.toLowerCase() || '';
        const countryBadge = card.querySelector('.badge.bg-secondary')?.textContent.toLowerCase() || '';

        // Also check data-product-code attribute for more reliable product code search
        const productCodeAttr = card.getAttribute('data-product-code')?.toLowerCase() || '';

        // Search in product checkbox data-product-code as well
        const productCheckbox = card.querySelector('.product-checkbox');
        const checkboxProductCode = productCheckbox?.getAttribute('value')?.toLowerCase() || '';

        // Also search in option codes and option names within each product
        const optionElements = card.querySelectorAll('.option-card');
        let optionMatches = false;
        optionElements.forEach(optionCard => {
            const optionName = optionCard.querySelector('h6.text-primary')?.textContent.toLowerCase() || '';
            // Find the small element containing the option code
            const optionCodeSmall = optionCard.querySelector('small.text-muted');
            const optionCode = optionCodeSmall?.textContent.toLowerCase() || '';

            // Also check data-option-code attribute
            const optionCodeAttr = optionCard.getAttribute('data-option-code')?.toLowerCase() || '';

            // Search in option checkbox data-option-code as well
            const optionCheckbox = optionCard.querySelector('.option-checkbox');
            const checkboxOptionCode = optionCheckbox?.getAttribute('data-option-code')?.toLowerCase() || '';

            if (optionName.includes(searchTerm) ||
                optionCode.includes(searchTerm) ||
                optionCodeAttr.includes(searchTerm) ||
                checkboxOptionCode.includes(searchTerm)) {
                optionMatches = true;
            }
        });

        const isVisible = productName.includes(searchTerm) ||
            productCode.includes(searchTerm) ||
            productCodeAttr.includes(searchTerm) ||
            checkboxProductCode.includes(searchTerm) ||
            countryBadge.includes(searchTerm) ||
            optionMatches;

        card.style.display = isVisible ? 'block' : 'none';
        if (isVisible) visibleCount++;
    });

    // Update filtered product count
    const filteredCountElement = document.getElementById('filteredProductCount');
    if (filteredCountElement) {
        filteredCountElement.textContent = visibleCount;
    }
}

/**
 * Toggle country filter visibility
 */
function toggleCountryFilter() {
    const filterSection = document.getElementById('countryFilterSection');
    if (filterSection) {
        filterSection.style.display = filterSection.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Select all countries in filter
 */
function selectAllCountries() {
    const checkboxes = document.querySelectorAll('#countryCheckboxes input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    applyCountryFilter();
}

/**
 * Deselect all countries in filter
 */
function deselectAllCountries() {
    const checkboxes = document.querySelectorAll('#countryCheckboxes input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    // Uncheck all products and options since no countries are selected
    const allProductCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="product-"]');
    allProductCheckboxes.forEach(productCheckbox => {
        if (productCheckbox.checked) {
            productCheckbox.checked = false;
            if (typeof togglePricingConfig === 'function') {
                togglePricingConfig(productCheckbox);
            }
        }
    });

    const allOptionCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="option-"]');
    allOptionCheckboxes.forEach(optionCheckbox => {
        if (optionCheckbox.checked) {
            optionCheckbox.checked = false;
            if (typeof updateOptionCheckboxVisualState === 'function') {
                updateOptionCheckboxVisualState(optionCheckbox);
            }
        }
    });

    // Update selection counts
    if (typeof updateSelectedCount === 'function') {
        updateSelectedCount();
    }

    applyCountryFilter();
}

/**
 * Apply country filter
 */
function applyCountryFilter() {
    const selectedCountries = Array.from(document.querySelectorAll('#countryCheckboxes input[type="checkbox"]:checked'))
        .map(cb => cb.value.toLowerCase());

    const productCards = document.querySelectorAll('.col-12.mb-4');
    let visibleCount = 0;

    productCards.forEach((card, index) => {
        // Try to get country from data-country attribute first (most reliable)
        let country = card.getAttribute('data-country');

        // If no data-country attribute, try to find it in the country badge (bg-info)
        if (!country) {
            const countryBadge = card.querySelector('.badge.bg-info');
            if (countryBadge) {
                // Extract country from badge text (remove the icon)
                const badgeText = countryBadge.textContent;
                country = badgeText.replace(/\s*\S+\s*/, '').trim();
            }
        }

        // Convert to lowercase for comparison
        country = country ? country.toLowerCase() : '';

        // Show product only if its country is in the selected countries list
        // If no countries are selected, hide all products
        const isVisible = selectedCountries.length > 0 && selectedCountries.includes(country);
        card.style.display = isVisible ? 'block' : 'none';

        // If country is not selected, uncheck the product and all its options
        if (!isVisible) {
            // Uncheck main product checkbox
            const productCheckbox = card.querySelector('input[type="checkbox"][id^="product-"]');
            if (productCheckbox && productCheckbox.checked) {
                productCheckbox.checked = false;
                // Trigger change event to update related UI
                if (typeof togglePricingConfig === 'function') {
                    togglePricingConfig(productCheckbox);
                }
            }

            // Uncheck all option checkboxes for this product
            const optionCheckboxes = card.querySelectorAll('input[type="checkbox"][id^="option-"]');
            optionCheckboxes.forEach(optionCheckbox => {
                if (optionCheckbox.checked) {
                    optionCheckbox.checked = false;
                    // Trigger change event to update related UI
                    if (typeof updateOptionCheckboxVisualState === 'function') {
                        updateOptionCheckboxVisualState(optionCheckbox);
                    }
                }
            });
        }

        if (isVisible) {
            visibleCount++;
        }
    });

    // Update selection counts after unchecking products/options
    if (typeof updateSelectedCount === 'function') {
        updateSelectedCount();
    }

    // Update counts
    document.getElementById('filteredCountryCount').textContent = selectedCountries.length;
    document.getElementById('filteredProductCount').textContent = visibleCount;
}

/**
 * Test Ubiqfy authentication
 */
async function testUbiqfyAuth() {
    const btn = event.target;
    setButtonLoading(btn, true);

    // Ensure storeId is available
    if (!storeId && window.storeData) {
        initializeStoreData(window.storeData);
    }

    if (!storeId) {
        showToast('❌ Error: Store ID not available. Please refresh the page and try again.', 'error');
        setButtonLoading(btn, false);
        return;
    }

    try {
        const { response, result } = await apiCall(`/wp-stores/${storeId}/test-ubiqfy-auth`, {
            method: 'POST'
        });

        if (response.ok && result.success) {
            let message = `<strong>✅ Ubiqfy Authentication Successful!</strong><br>`;
            if (result.data && result.data.token) {
                message += `<i class="fas fa-key"></i> Token received<br>`;
                message += `<i class="fas fa-coins"></i> Plafond: ${result.data.plafond || 'N/A'}<br>`;
            }
            message += `<small>${result.message || result.data.message || 'Connection verified'}</small>`;
            showToast(message, 'success');
        } else {
            const errorMsg = result.message || result.error || 'Unknown error';
            showToast(`<strong>❌ Ubiqfy Authentication Failed</strong><br><small>${errorMsg}</small>`, 'error');
        }
    } catch (error) {
        showToast('<strong>❌ Network Error</strong><br><small>Could not connect to Ubiqfy API. Please check your credentials and try again.</small>', 'error');
        console.error('Ubiqfy test error:', error);
    } finally {
        setButtonLoading(btn, false);
    }
}

/**
 * Fetch Ubiqfy products
 */
async function fetchUbiqfyProducts() {
    const btn = event.target;
    setButtonLoading(btn, true);

    // Ensure storeId is available
    if (!storeId && window.storeData) {
        initializeStoreData(window.storeData);
    }

    if (!storeId) {
        alert('❌ Error: Store ID not available. Please refresh the page and try again.');
        setButtonLoading(btn, false);
        return;
    }

    try {
        const { response, result } = await apiCall(`/wp-stores/${storeId}/fetch-ubiqfy-products`, {
            method: 'POST'
        });

        if (response.ok && result.success) {
            const filteringResult = displayProductsOnScreen(result.data);

            // Get proper counts from actual data, not metadata
            const actualProductCount = result.data.products ? result.data.products.length : 0;
            const metadataCount = result.data.metadata ? result.data.metadata.productCount : 0;
            const productTypeCode = result.data.metadata ? result.data.metadata.productTypeCode : 'Unknown';

            // Use actual count as "Original" (what we received from API)
            const originalProductCount = actualProductCount;

            let alertContent = `
                <div class="text-center mb-3">
                    <i class="fas fa-check-circle text-success fa-2x mb-2"></i>
                    <h5 class="text-success mb-0">Products Loaded Successfully!</h5>
                </div>
                <div class="row g-2 text-start">
                    <div class="col-12">
                        <span class="badge bg-primary me-2">📦</span>
                        <strong>Product Type:</strong> ${productTypeCode}
                    </div>
                    <div class="col-12">
                        <span class="badge bg-info me-2">🔢</span>
                        <strong>Received:</strong> ${originalProductCount} products
                    </div>`;

            if (filteringResult) {
                const availableCount = filteringResult.availableCount || 0;
                const originalOptionsCount = filteringResult.originalOptionsCount || 0;
                const availableOptionsCount = filteringResult.availableOptionsCount || 0;
                const newProductsCount = filteringResult.newProductsCount || 0;
                const existingProductsCount = filteringResult.existingProductsCount || 0;

                alertContent += `
                    <div class="col-12">
                        <span class="badge bg-success me-2">✅</span>
                        <strong>Available:</strong> ${availableCount} products
                    </div>
                    <div class="col-12">
                        <span class="badge bg-info me-2">⚙️</span>
                        <strong>Product Options:</strong> ${availableOptionsCount} available of ${originalOptionsCount} total
                    </div>`;

                // Show new vs existing breakdown if we have the data
                if (newProductsCount > 0 || existingProductsCount > 0) {
                    alertContent += `
                    <div class="col-12">
                        <span class="badge bg-primary me-2">🆕</span>
                        <strong>New Products:</strong> ${newProductsCount}
                    </div>
                    <div class="col-12">
                        <span class="badge bg-secondary me-2">📋</span>
                        <strong>Previously Synced:</strong> ${existingProductsCount}
                    </div>`;
                }

                if (filteringResult.filteredOutCount && filteringResult.filteredOutCount > 0) {
                    alertContent += `
                    <div class="col-12">
                        <span class="badge bg-warning me-2">🚫</span>
                        <strong>Hidden Products:</strong> ${filteringResult.filteredOutCount} with price ranges
                    </div>`;
                }
                if (filteringResult.filteredOptionsCount && filteringResult.filteredOptionsCount > 0) {
                    alertContent += `
                    <div class="col-12">
                        <span class="badge bg-secondary me-2">🔧</span>
                        <strong>Hidden Options:</strong> ${filteringResult.filteredOptionsCount} price range options
                    </div>`;
                }
            }

            alertContent += `</div>`;

            // Show modern alert for longer duration (10 seconds) since it has detailed info
            showAlert(alertContent, 'success', 10000);
        } else {
            const errorMsg = result.message || result.error || 'Unknown error';
            showAlert(`<i class="fas fa-exclamation-triangle me-2"></i>Failed to fetch products: ${errorMsg}`, 'error');
        }
    } catch (error) {
        showAlert(`<i class="fas fa-wifi me-2"></i>Network Error: Could not fetch products from Ubiqfy API. Please check your connection and try again.`, 'error');
        console.error('Ubiqfy products fetch error:', error);
    } finally {
        setButtonLoading(btn, false);
    }
}

/**
 * Load cached products from database (no API call to Ubiqfy)
 */
async function loadCachedProducts() {
    // Ensure storeId is available
    if (!storeId && window.storeData) {
        initializeStoreData(window.storeData);
    }

    if (!storeId) {
        return;
    }

    try {
        const { response, result } = await apiCall(`/wp-stores/${storeId}/products`, {
            method: 'GET'
        });

        if (response.ok && result.success && result.data.products && result.data.products.length > 0) {
            // Convert database products to API format for displayProductsOnScreen
            const apiFormatData = {
                products: result.data.products.map(product => ({
                    ProductCode: product.product_code,
                    Name: product.name,
                    ProviderCode: product.provider_code,
                    Description: product.description,
                    ProductDescription: product.product_description,
                    ProductLogo: product.logo_url,
                    BrandLogo: product.brand_logo_url,
                    TermsUrl: product.terms_url,
                    PrivacyUrl: product.privacy_url,
                    ReedemUrl: product.reedem_url,
                    Notes: product.notes,
                    ReedemDesc: product.reedem_desc,
                    ReceiptMessage: product.receipt_message,
                    NextMethodCall: product.next_method_call,
                    IsVoucher: product.is_voucher,
                    IsTransationCancelabled: product.is_transaction_cancelabled,
                    CountryIso: product.country_iso,
                    CurrencyCode: product.currency_code,
                    ProductCurrencyCode: product.product_currency_code,
                    Discount: product.discount,
                    ProductUrl: product.product_url,
                    TermsConditions: product.terms_conditions,
                    ProductOptionsList: product.options ? product.options.map(option => ({
                        ProductOptionCode: option.product_option_code,
                        Name: option.name,
                        EanSkuUpc: option.ean_sku_upc,
                        Description: option.description,
                        Logo: option.logo_url,
                        MinMaxFaceRangeValue: {
                            MinFaceValue: option.min_face_value,
                            MaxFaceValue: option.max_face_value
                        },
                        MinMaxRangeValue: {
                            MinValue: option.min_value,
                            MaxValue: option.max_value,
                            MinWholesaleValue: option.min_wholesale_value,
                            MaxWholesaleValue: option.max_wholesale_value
                        }
                    })) : []
                })),
                metadata: result.data.metadata
            };

            displayProductsOnScreen(apiFormatData);

            // Show a subtle indication that these are cached products
            const productTypeLabel = document.getElementById('productTypeLabel');
            if (productTypeLabel) {
                productTypeLabel.innerHTML = `<i class="fas fa-database me-1"></i>Cached Products`;
            }
        } else {
            // Show empty state
            showEmptyProductsState();
        }
    } catch (error) {
        // Show empty state on error
        showEmptyProductsState();
    }
}

/**
 * Show empty products state
 */
function showEmptyProductsState() {
    const productsCard = document.getElementById('productsCard');
    const noProductsMessage = document.getElementById('noProductsMessage');

    if (productsCard && noProductsMessage) {
        productsCard.style.display = 'block';
        noProductsMessage.style.display = 'block';
    }
}

/**
 * Simple fallback product list when renderFilteredProducts is not available
 */
function showSimpleProductList(products) {
    const productsContainer = document.getElementById('productsContainer');
    if (!productsContainer) return;

    let html = `
        <div class="alert alert-info" role="alert">
            <h5 class="alert-heading">📦 Products Loaded from Cache</h5>
            <p>Found ${products.length} products. The full rendering system is loading...</p>
            <hr>
            <button class="btn btn-primary" onclick="window.location.reload()">
                <i class="fas fa-refresh"></i> Refresh Page
            </button>
            <button class="btn btn-success ms-2" onclick="fetchUbiqfyProducts()">
                <i class="fas fa-download"></i> Fetch Fresh Products
            </button>
        </div>
        <div class="row">
    `;

    products.slice(0, 10).forEach(product => {
        html += `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">${product.Name || 'Unknown Product'}</h6>
                        <p class="text-muted small">Code: ${product.ProductCode}</p>
                        <p class="text-muted small">Country: ${product.CountryIso}</p>
                        <p class="text-muted small">Options: ${product.ProductOptionsList?.length || 0}</p>
                    </div>
                </div>
            </div>
        `;
    });

    if (products.length > 10) {
        html += `
            <div class="col-12">
                <div class="alert alert-secondary text-center">
                    <p>Showing first 10 of ${products.length} products. Refresh the page to see all products with full functionality.</p>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    productsContainer.innerHTML = html;
}

/**
 * Filter products to only include fixed-price options (not price ranges)
 * For each product, filters out options where MinValue !== MaxValue
 * Only removes entire products if ALL options have price ranges
 */
function filterFixedPriceProducts(products) {
    return products.map(product => {
        // If no options, return product as-is
        if (!product.ProductOptionsList || product.ProductOptionsList.length === 0) {
            return product;
        }

        // Filter options within the product
        const originalOptionsCount = product.ProductOptionsList.length;
        const filteredOptions = product.ProductOptionsList.filter(option => {
            if (!option.MinMaxRangeValue) {
                return true; // Keep options without price range data
            }

            const minValue = option.MinMaxRangeValue.MinValue || 0;
            const maxValue = option.MinMaxRangeValue.MaxValue || 0;
            const isFixedPrice = minValue === maxValue;

            return isFixedPrice;
        });

        // Create new product object with filtered options
        const filteredProduct = { ...product };
        filteredProduct.ProductOptionsList = filteredOptions;

        const removedOptionsCount = originalOptionsCount - filteredOptions.length;
        return filteredProduct;
    }).filter(product => {
        // Remove products that have no options left after filtering
        const hasValidOptions = product.ProductOptionsList && product.ProductOptionsList.length > 0;
        return hasValidOptions || !product.ProductOptionsList; // Keep products without options list
    });
}

/**
 * Display products on screen
 */
async function displayProductsOnScreen(data) {
    const productsCard = document.getElementById('productsCard');
    const productsContainer = document.getElementById('productsContainer');
    const noProductsMessage = document.getElementById('noProductsMessage');
    const productTypeLabel = document.getElementById('productTypeLabel');
    const productCountLabel = document.getElementById('productCountLabel');
    const countryFilterSection = document.getElementById('countryFilterSection');

    // Show the products card
    productsCard.style.display = 'block';

    if (data.products && data.products.length > 0) {
        // Hide no products message and show container
        noProductsMessage.style.display = 'none';
        productsContainer.style.display = 'block';

        // Update labels
        const productCount = data.metadata ? data.metadata.productCount : data.products.length;
        const productTypeCode = data.metadata ? data.metadata.productTypeCode : 'Products';

        productTypeLabel.textContent = productTypeCode;
        productCountLabel.textContent = productCount;

        // Clear existing products
        productsContainer.innerHTML = '';

        // Filter out products with price range options (MinValue !== MaxValue)
        const originalProductCount = data.products.length;
        let totalFilteredOptionsCount = 0;

        // Count original options for statistics
        const originalOptionsCount = data.products.reduce((total, product) => {
            return total + (product.ProductOptionsList ? product.ProductOptionsList.length : 0);
        }, 0);

        const filteredProducts = filterFixedPriceProducts(data.products);

        // Count remaining options for statistics
        const remainingOptionsCount = filteredProducts.reduce((total, product) => {
            return total + (product.ProductOptionsList ? product.ProductOptionsList.length : 0);
        }, 0);

        totalFilteredOptionsCount = originalOptionsCount - remainingOptionsCount;
        const filteredProductCount = originalProductCount - filteredProducts.length;

        // Collect all unique countries from filtered products
        const countries = new Set();
        filteredProducts.forEach(product => {
            if (product.CountryIso) {
                countries.add(product.CountryIso);
            }
        });

        // Populate country filter if there are any countries
        if (countries.size > 0) {
            populateCountryFilter(Array.from(countries));
        }

        // Render filtered products using the existing function
        if (typeof renderFilteredProducts === 'function') {
            try {
                renderFilteredProducts(filteredProducts);
            } catch (error) {
                console.error('❌ Error in renderFilteredProducts:', error);
                // Fallback to simple product listing
                showSimpleProductList(filteredProducts);
            }
        } else {
            setTimeout(() => {
                if (typeof renderFilteredProducts === 'function') {
                    try {
                        renderFilteredProducts(filteredProducts);
                    } catch (error) {
                        console.error('❌ Error in renderFilteredProducts on retry:', error);
                        showSimpleProductList(filteredProducts);
                    }
                } else {
                    console.error('❌ renderFilteredProducts function still not available after retry');
                    // Show a simple fallback
                    showSimpleProductList(filteredProducts);
                }
            }, 500);
        }

        // Update count label with filtered count
        productCountLabel.textContent = filteredProducts.length;

        // Initialize option states
        initializeOptionCheckboxStates();

        // Load and mark existing synced products and collect statistics
        await loadAndMarkExistingProducts();

        // Count new vs existing products after marking
        let newProductsCount = 0;
        let existingProductsCount = 0;

        filteredProducts.forEach(product => {
            if (product.ProductOptionsList && product.ProductOptionsList.length > 0) {
                // For products with options, check each option
                let hasExistingOptions = false;
                product.ProductOptionsList.forEach(option => {
                    const optionCard = document.querySelector(`[data-option-code="${option.ProductOptionCode}"]`);
                    if (optionCard && (optionCard.classList.contains('synced-product') || optionCard.classList.contains('stored-option'))) {
                        hasExistingOptions = true;
                    }
                });
                if (hasExistingOptions) {
                    existingProductsCount++;
                } else {
                    newProductsCount++;
                }
            } else {
                // For products without options, check the product card
                const productCard = document.querySelector(`[data-product-code="${product.ProductCode}"]`);
                if (productCard && productCard.classList.contains('synced-product')) {
                    existingProductsCount++;
                } else {
                    newProductsCount++;
                }
            }
        });

        // Return detailed filtering statistics including new/existing counts
        return {
            originalProductCount: originalProductCount,
            originalOptionsCount: originalOptionsCount,
            availableCount: filteredProducts.length,
            availableOptionsCount: remainingOptionsCount,
            filteredOutCount: filteredProductCount,
            filteredOptionsCount: totalFilteredOptionsCount,
            newProductsCount: newProductsCount,
            existingProductsCount: existingProductsCount
        };
    } else {
        // Show no products message
        noProductsMessage.style.display = 'block';
        productsContainer.style.display = 'none';
        countryFilterSection.style.display = 'none';

        return null;
    }
}

/**
 * Populate country filter checkboxes
 */
function populateCountryFilter(countries) {
    const countryCheckboxes = document.getElementById('countryCheckboxes');
    countryCheckboxes.innerHTML = '';

    countries.sort().forEach(country => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'form-check form-check-inline';

        const checkbox = document.createElement('input');
        checkbox.className = 'form-check-input';
        checkbox.type = 'checkbox';
        checkbox.id = `country-${country}`;
        checkbox.value = country;
        checkbox.checked = true;
        checkbox.onchange = applyCountryFilter;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `country-${country}`;
        label.textContent = country;

        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        countryCheckboxes.appendChild(checkboxDiv);
    });

    // Show country filter section
    document.getElementById('countryFilterSection').style.display = 'block';

    // Update initial counts
    document.getElementById('filteredCountryCount').textContent = countries.length;
    // Count actual products initially (all should be visible)
    setTimeout(() => {
        const visibleProducts = document.querySelectorAll('.col-12.mb-4:not([style*="display: none"])').length;
        document.getElementById('filteredProductCount').textContent = visibleProducts;
    }, 100);
}

/**
 * Update selected count badge
 */
function updateSelectedCountWrapper() {
    // Use the main updateSelectedCount function from product-sync.js if available
    if (typeof updateSelectedCount === 'function') {
        updateSelectedCount();
        return;
    }

    // Fallback implementation if main function is not available
    const checkedProductBoxes = document.querySelectorAll('.product-checkbox:checked');
    const checkedOptionBoxes = document.querySelectorAll('.option-checkbox:checked');
    const productCount = checkedProductBoxes.length;
    const optionCount = checkedOptionBoxes.length;

    const badge = document.getElementById('selectedCountBadge');
    const syncBtn = document.getElementById('syncTowpBtn');

    if (badge) {
        const productSpan = badge.querySelector('span:first-child');
        const optionSpan = badge.querySelector('span:last-child');

        if (productSpan) productSpan.textContent = productCount;
        if (optionSpan) optionSpan.textContent = optionCount;
    }

    if (syncBtn) {
        if (optionCount > 0) {
            syncBtn.disabled = false;
            syncBtn.classList.remove('btn-secondary');
            syncBtn.classList.add('btn-primary');
        } else {
            syncBtn.disabled = true;
            syncBtn.classList.remove('btn-primary');
            syncBtn.classList.add('btn-secondary');
        }
    }
}

/**
 * Update country filter counters
 * Called by product-rendering.js after rendering products
 */
function updateCountryFilterCounters() {
    const selectedCountries = document.querySelectorAll('#countryCheckboxes input[type="checkbox"]:checked').length;
    const visibleProducts = document.querySelectorAll('.col-12.mb-4:not([style*="display: none"])').length;

    const filteredCountryCount = document.getElementById('filteredCountryCount');
    const filteredProductCount = document.getElementById('filteredProductCount');

    if (filteredCountryCount) {
        filteredCountryCount.textContent = selectedCountries;
    }
    if (filteredProductCount) {
        filteredProductCount.textContent = visibleProducts;
    }
}

/**
 * Load existing synced products and mark them visually
 */
async function loadAndMarkExistingProducts() {
    if (!storeId) {
        return;
    }

    try {
        const [syncedResponse, storedOptionsResponse] = await Promise.all([
            apiCall(`/wp-stores/${storeId}/synced-products`),
            apiCall(`/wp-stores/${storeId}/stored-options`)
        ]);

        const syncedProducts = [];
        const storedOptionsMap = {};

        if (syncedResponse.response.ok && syncedResponse.result.success) {
            syncedProducts.push(...(syncedResponse.result.data.products || []));
        }

        if (storedOptionsResponse.response.ok && storedOptionsResponse.result.success) {
            Object.assign(storedOptionsMap, storedOptionsResponse.result.data || {});
        }

        syncedProducts.forEach(product => {
            markProductAsSynced(product.productCode, product.optionCode);
        });

        const storedOptionEntries = Object.entries(storedOptionsMap);

        if (storedOptionEntries.length > 0 && typeof window !== 'undefined') {
            window.isLoadingExistingData = true;
        }

        storedOptionEntries.forEach(([optionCode, optionData]) => {
            selectStoredOption(optionCode);
            loadCustomPriceForOption(optionCode, optionData);
        });

        if (storedOptionEntries.length > 0) {
            setTimeout(() => {
                if (typeof window !== 'undefined') {
                    window.isLoadingExistingData = false;
                }
            }, 2000);
        }

        setTimeout(() => {
            if (typeof updateSelectedCount === 'function') {
                updateSelectedCount();
            }
        }, 100);
    } catch (error) {
        console.error('Error loading existing products:', error);
    }
}

/**
 * Mark a product as already synced to wp
 */
function markProductAsSynced(productCode, optionCode = null) {
    const checkbox = optionCode
        ? document.querySelector(`.option-checkbox[data-option-code="${optionCode}"]`)
        : document.querySelector(`.product-checkbox[value="${productCode}"]`);

    if (!checkbox) {
        return;
    }

    const card = checkbox.closest('.col-12, .card');
    if (!card) {
        return;
    }

    card.classList.add('product-synced', 'newly-marked');
    card.classList.remove('product-stored');

    addSyncedBadgeToCard(card);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    setTimeout(() => {
        card.classList.remove('newly-marked');
    }, 600);
}

/**
 * Select a specific option that exists in the database
 * Only selects the option checkbox, doesn't add badges or mark the product card
 */
function selectStoredOption(optionCode) {
    const optionCheckbox = document.querySelector(`.option-checkbox[data-option-code="${optionCode}"]`);

    if (!optionCheckbox) {
        return;
    }

    optionCheckbox.checked = true;
    optionCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Add synced badge to card
 */
function addSyncedBadgeToCard(card) {
    // Remove any existing status badges first
    const existingBadges = card.querySelectorAll('.status-badge');
    existingBadges.forEach(badge => badge.remove());

    // Add new synced badge
    const badge = document.createElement('span');
    badge.className = 'badge bg-success status-badge position-absolute';
    badge.style.cssText = 'top: 10px; right: 10px; z-index: 10;';
    badge.innerHTML = '<i class="fas fa-check-circle"></i> Synced to wp';

    const cardBody = card.querySelector('.card-body') || card;
    cardBody.style.position = 'relative';
    cardBody.appendChild(badge);
}

/**
 * Load custom price for an option from database and populate the UI
 */
function loadCustomPriceForOption(optionCode, optionData) {
    const optionCheckbox = document.querySelector(`.option-checkbox[data-option-code="${optionCode}"]`);
    if (!optionCheckbox) {
        return;
    }

    const optionCard = optionCheckbox.closest('.option-card');
    if (!optionCard) {
        return;
    }

    if (optionData.id) {
        optionCard.setAttribute('data-option-id', optionData.id);
    }

    const customPriceInput = optionCard.querySelector('.custom-price-input');
    if (customPriceInput && optionData.customPrice !== null && optionData.customPrice !== undefined) {
        const customPrice = parseFloat(optionData.customPrice);
        if (!isNaN(customPrice)) {
            customPriceInput.value = customPrice.toFixed(2);
        }
    }

    const markupInput = optionCard.querySelector('.markup-input');
    if (markupInput && optionData.markupPercentage !== null && optionData.markupPercentage !== undefined) {
        const customPrice = optionData.customPrice !== null && optionData.customPrice !== undefined
            ? parseFloat(optionData.customPrice)
            : NaN;

        if (!isNaN(customPrice)) {
            const originalRetailPrice = parseFloat(customPriceInput?.getAttribute('data-original-price')) || 0;
            const originalDiscount = parseFloat(customPriceInput?.getAttribute('data-original-discount')) || 0;
            const wholesalePriceUSD = originalRetailPrice - (originalRetailPrice * originalDiscount);
            const currentConversionRate = window.storeData?.currency_conversion_rate || 3.75;
            const wholesalePriceStore = wholesalePriceUSD * currentConversionRate;

            if (wholesalePriceStore > 0) {
                const difference = customPrice - wholesalePriceStore;
                const recalculatedMarkup = (difference / wholesalePriceStore) * 100;
                markupInput.value = recalculatedMarkup.toFixed(2);
            }
        }

        if (!markupInput.value) {
            const markupPercentage = parseFloat(optionData.markupPercentage);
            if (!isNaN(markupPercentage)) {
                markupInput.value = markupPercentage.toFixed(2);
            }
        }
    }

    const finalPriceDisplay = optionCard.querySelector('.final-price-display');
    if (finalPriceDisplay && optionData.customPrice !== null && optionData.customPrice !== undefined) {
        const customPrice = parseFloat(optionData.customPrice);
        if (!isNaN(customPrice)) {
            finalPriceDisplay.textContent = `${customPrice.toFixed(2)} ${wpCurrency || 'SAR'}`;
        }
    }

    const priceInput = optionCard.querySelector('.custom-price-input');
    if (priceInput && typeof updateFinalPriceWithBinding === 'function') {
        updateFinalPriceWithBinding(priceInput, true);
    }
}
