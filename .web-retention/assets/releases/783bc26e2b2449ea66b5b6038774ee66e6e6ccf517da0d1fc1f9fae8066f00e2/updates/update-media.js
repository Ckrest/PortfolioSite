import PhotoSwipeLightbox from './vendor/photoswipe-lightbox.esm.js';

let lightbox = null;

function slideElement(itemData) {
  return itemData?.element instanceof Element ? itemData.element : null;
}

function enrichItemData(itemData) {
  const trigger = slideElement(itemData);
  if (!trigger) return itemData;
  const image = trigger.querySelector('img');
  const naturalWidth = image?.naturalWidth || Number(trigger.dataset.pswpWidth) || 1;
  const naturalHeight = image?.naturalHeight || Number(trigger.dataset.pswpHeight) || 1;
  return {
    ...itemData,
    width: naturalWidth,
    height: naturalHeight,
    w: naturalWidth,
    h: naturalHeight,
    alt: String(trigger.dataset.pswpDescription || image?.alt || ''),
    description: String(trigger.dataset.pswpDescription || image?.alt || ''),
  };
}

function renderCaption(container, pswp) {
  const data = pswp.currSlide?.data || {};
  const description = String(data.description || '').trim();
  container.replaceChildren();
  if (description) {
    const text = document.createElement('span');
    text.className = 'media-viewer-description';
    text.textContent = description;
    container.append(text);
  }
  container.hidden = !description;
}

export function initializeMediaViewer(root = document) {
  lightbox?.destroy();
  lightbox = null;
  if (!root.querySelector('.media-gallery > a[data-pswp-src]')) return null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  lightbox = new PhotoSwipeLightbox({
    gallery: root.querySelectorAll('.media-gallery'),
    children: 'a[data-pswp-src]',
    pswpModule: () => import('./vendor/photoswipe.esm.js'),
    trapFocus: true,
    returnFocus: true,
    escKey: true,
    arrowKeys: true,
    wheelToZoom: true,
    loop: false,
    showHideAnimationType: reduceMotion ? 'none' : 'fade',
    showAnimationDuration: reduceMotion ? 0 : 180,
    hideAnimationDuration: reduceMotion ? 0 : 180,
    zoomAnimationDuration: reduceMotion ? 0 : 250,
    closeTitle: 'Close image viewer',
    zoomTitle: 'Zoom image',
    arrowPrevTitle: 'Previous image',
    arrowNextTitle: 'Next image',
    errorMsg: 'The full-size image could not be loaded',
    indexIndicatorSep: ' of ',
  });

  lightbox.addFilter('itemData', enrichItemData);
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'portfolio-caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      html: '',
      onInit: (element, pswp) => {
        element.classList.add('media-viewer-caption');
        element.setAttribute('aria-live', 'polite');
        pswp.on('change', () => renderCaption(element, pswp));
      },
    });
  });
  lightbox.on('afterInit', () => {
    lightbox.pswp.element?.setAttribute('aria-label', 'Image viewer');
  });
  lightbox.init();
  return lightbox;
}

export function destroyMediaViewer() {
  lightbox?.destroy();
  lightbox = null;
}
