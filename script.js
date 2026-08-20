document.addEventListener("DOMContentLoaded", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;


  /* =========================================================
     PRELOADER AUCARIA
     Espera la carga inicial + fuente, pero nunca queda trabado.
  ========================================================= */

  const aucariaPreloader = document.querySelector("#aucaria-preloader");
  const preloaderStart = performance.now();

  let preloaderHasHidden = false;
  let preloaderHideTimer = null;

  function hideAucariaPreloader() {

    if (!aucariaPreloader || preloaderHasHidden) return;

    preloaderHasHidden = true;

    /* Evita un flash demasiado rápido si todo estaba en caché. */
    const minimumVisibleTime = 850;
    const elapsed = performance.now() - preloaderStart;
    const remaining = Math.max(0, minimumVisibleTime - elapsed);

    preloaderHideTimer = window.setTimeout(() => {

      /* Dos frames garantizan que el SVG del río ya haya pintado. */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {

          aucariaPreloader.classList.add("is-hidden");
          document.body.classList.remove("preloader-active");

          window.setTimeout(() => {
            aucariaPreloader.remove();
          }, 750);

        });
      });

    }, remaining);

  }

  async function finishInitialLoad() {

    /* Esperamos brevemente la fuente para revelar el marquee ya medido
       con DM Sans. Si la red está lenta, no bloqueamos más de 1.8 s. */
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1800))
      ]);
    }

    hideAucariaPreloader();

  }

  if (document.readyState === "complete") {
    finishInitialLoad();
  } else {
    window.addEventListener("load", finishInitialLoad, { once: true });
  }

  /* Failsafe absoluto: ningún recurso roto puede dejar el loader visible. */
  window.setTimeout(hideAucariaPreloader, 5500);



  /* =========================================================
     BARRA-RÍO — MARQUEE CONTINUO SOBRE EL PATH REAL
  ========================================================= */

  const riverPath = document.querySelector("#announcementRiverPath");
  const riverLayer = document.querySelector(".announcement-river-text-layer");
  const riverSvg = document.querySelector(".announcement-river-svg");
  const riverBar = document.querySelector(".announcement-bar");
  const svgNS = "http://www.w3.org/2000/svg";

  let riverAnimationFrame = null;
  let riverResizeFrame = null;

  function createRiverPhrase(startOffset = 0) {

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("class", "announcement-river-text");
    text.setAttribute("xml:space", "preserve");

    const textPath = document.createElementNS(svgNS, "textPath");
    textPath.setAttribute("href", "#announcementRiverPath");
    textPath.setAttribute("startOffset", startOffset);
    textPath.setAttribute("xml:space", "preserve");

    /* IMPORTANTE:
       Ya no usamos dx para separar piezas. Los espacios forman parte
       real del texto, por lo que getComputedTextLength() mide EXACTAMENTE
       lo mismo que se ve en pantalla. */
    const pieces = [
      ["DISEÑO WEB", false],
      ["   ✦   ", true],
      ["IDENTIDAD VISUAL", false],
      ["   ✦   ", true],
      ["DISEÑO PARA REDES", false],
      ["   ✦   ", true],
      ["E-COMMERCE", false],
      ["   ✦     ", true]
    ];

    pieces.forEach(([content, isStar]) => {

      const tspan = document.createElementNS(svgNS, "tspan");
      tspan.textContent = content;

      if (isStar) {
        tspan.setAttribute("class", "announcement-river-star");
      }

      textPath.appendChild(tspan);

    });

    text.appendChild(textPath);

    return {
      text,
      textPath
    };
  }


  function setupRiverMarquee() {

    if (!riverPath || !riverLayer) return;

    /* En tablet/mobile ajustamos el viewBox al aspecto REAL de la barra.
       Así el SVG deja de "aplastar" horizontalmente las letras.
       Desktop conserva exactamente el viewBox original. */
    if (riverSvg && riverBar) {
      if (window.innerWidth <= 900) {
        const rect = riverBar.getBoundingClientRect();
        const viewHeight = 150;
        const visibleWidth = viewHeight * (rect.width / rect.height);
        const centerX = 800;
        const viewX = centerX - (visibleWidth / 2);

        riverSvg.setAttribute(
          "viewBox",
          `${viewX.toFixed(2)} 0 ${visibleWidth.toFixed(2)} ${viewHeight}`
        );
      } else {
        riverSvg.setAttribute("viewBox", "0 0 1600 150");
      }
    }

    if (riverAnimationFrame) {
      cancelAnimationFrame(riverAnimationFrame);
      riverAnimationFrame = null;
    }

    /* No esperamos la fuente web: dibujamos el río inmediatamente.
       Cuando DM Sans termina de cargar, hacemos un único recálculo abajo. */

    riverLayer.replaceChildren();

    const sample = createRiverPhrase(0);

    riverLayer.appendChild(sample.text);

    const phraseWidth = sample.text.getComputedTextLength();

    sample.text.remove();


    /* LOOP EXACTO:
       step ES el ancho real completo de una tanda, incluyendo todos
       los espacios visibles entre palabras y después del último ✦.
       Por eso la siguiente tanda empieza exactamente cuando termina ésta. */
    const step = phraseWidth;
    const pathLength = riverPath.getTotalLength();

    /* Una tanda empieza antes del viewport y creamos suficientes copias
       para cubrir todo el río + una extra entrando por la derecha. */
    const firstOffset = -step;
    const neededWidth = pathLength + (step * 2);
    const amount = Math.ceil(neededWidth / step) + 1;

    const items = [];

    for (let i = 0; i < amount; i += 1) {

      const offset = firstOffset + (i * step);

      const phrase = createRiverPhrase(offset);

      riverLayer.appendChild(phrase.text);

      items.push({
        textPath: phrase.textPath,
        offset
      });

    }


    /* En reduced motion dejamos las tandas quietas pero completas. */
    if (reduceMotion) return;


    /* Velocidad comparable al marquee recto original. */
    const speed =
      window.innerWidth <= 700 ? 27 :
      window.innerWidth <= 900 ? 32 :
      38;


    let previousTime = null;

    function animateRiver(currentTime) {

      if (previousTime === null) {
        previousTime = currentTime;
      }

      const deltaSeconds = Math.min(
        (currentTime - previousTime) / 1000,
        .05
      );

      previousTime = currentTime;


      /* Movemos todas exactamente la misma cantidad. */
      items.forEach((item) => {
        item.offset -= speed * deltaSeconds;
      });


      /* Reciclamos una tanda SOLAMENTE cuando terminó por completo
         de salir por la izquierda. Luego empieza exactamente al final
         de la última tanda visible: ni antes (superposición) ni después (hueco). */
      let maxOffset = Math.max(...items.map(item => item.offset));

      items
        .filter(item => (item.offset + phraseWidth) <= 0)
        .sort((a, b) => a.offset - b.offset)
        .forEach((item) => {

          item.offset = maxOffset + phraseWidth;
          maxOffset = item.offset;

        });


      items.forEach((item) => {
        item.textPath.setAttribute(
          "startOffset",
          item.offset.toFixed(3)
        );
      });


      riverAnimationFrame = requestAnimationFrame(animateRiver);

    }

    riverAnimationFrame = requestAnimationFrame(animateRiver);

  }


  /* Primera pintura inmediata: evita que la barra aparezca vacía en móvil. */
  setupRiverMarquee();

  /* Cuando termina de cargar DM Sans, recalculamos una sola vez con su ancho real. */
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      setupRiverMarquee();
    });
  }


  window.addEventListener("resize", () => {

    if (riverResizeFrame) {
      cancelAnimationFrame(riverResizeFrame);
    }

    riverResizeFrame = requestAnimationFrame(() => {
      setupRiverMarquee();
    });

  }, { passive: true });


  /* =========================================================
     MENÚ RESPONSIVE
  ========================================================= */
  const menuToggle = document.querySelector(".menu-toggle");
  const menuList = document.querySelector(".menu-list");
  const mainNav = document.querySelector(".main-nav");

  const closeMenu = () => {
    if (!menuToggle || !menuList) return;
    menuList.classList.remove("is-open");
    menuToggle.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  if (menuToggle && menuList) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuList.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    menuList.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        menuToggle.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (menuList.classList.contains("is-open") && mainNav && !mainNav.contains(event.target)) {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeMenu();
    }, { passive: true });
  }

  /* =========================================================
     HERO / SLIDER
  ========================================================= */
  const slides = Array.from(document.querySelectorAll(".hero-slider .slide"));
  const dots = Array.from(document.querySelectorAll(".hero-slider .slider-dot"));
  const prev = document.querySelector(".hero-slider .slider-prev");
  const next = document.querySelector(".hero-slider .slider-next");
  const heroSlider = document.querySelector(".hero-slider");

  let current = 0;
  let autoplay = null;
  let heroTouchStartX = 0;

  function showSlide(index) {
    if (!slides.length) return;

    current = (index + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });

    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function stopAutoplay() {
    if (autoplay) {
      window.clearInterval(autoplay);
      autoplay = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    if (slides.length < 2 || reduceMotion || document.hidden) return;
    autoplay = window.setInterval(() => showSlide(current + 1), 5500);
  }

  prev?.addEventListener("click", () => {
    showSlide(current - 1);
    startAutoplay();
  });

  next?.addEventListener("click", () => {
    showSlide(current + 1);
    startAutoplay();
  });

  dots.forEach((dot, i) => {
    if (i >= slides.length) {
      dot.hidden = true;
      return;
    }
    dot.addEventListener("click", () => {
      showSlide(i);
      startAutoplay();
    });
  });

  heroSlider?.addEventListener("mouseenter", stopAutoplay);
  heroSlider?.addEventListener("mouseleave", startAutoplay);
  heroSlider?.addEventListener("focusin", stopAutoplay);
  heroSlider?.addEventListener("focusout", startAutoplay);

  heroSlider?.addEventListener("touchstart", (event) => {
    heroTouchStartX = event.changedTouches[0].clientX;
  }, { passive: true });

  heroSlider?.addEventListener("touchend", (event) => {
    const difference = event.changedTouches[0].clientX - heroTouchStartX;
    if (Math.abs(difference) > 45) {
      showSlide(current + (difference < 0 ? 1 : -1));
      startAutoplay();
    }
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoplay();
    else startAutoplay();
  });

  showSlide(0);
  startAutoplay();

  /* =========================================================
     CARRUSEL DE KITS
     Desktop conserva las 3 tarjetas visibles. En tablet/mobile
     las flechas y el swipe recorren las tarjetas restantes.
  ========================================================= */
  const kitsSlider = document.querySelector(".kits-slider");
  const kitsTrack = document.querySelector(".kits-track");
  const kitCards = Array.from(document.querySelectorAll(".kits-track .kit-card"));
  const kitsPrev = document.querySelector(".kits-prev");
  const kitsNext = document.querySelector(".kits-next");

  let kitIndex = 0;
  let kitTouchStartX = 0;
  let resizeFrame = null;

  function getKitGap() {
    if (!kitsTrack) return 0;
    const styles = window.getComputedStyle(kitsTrack);
    return Number.parseFloat(styles.columnGap || styles.gap) || 0;
  }

  function getVisibleKitCount() {
    if (!kitsSlider || !kitCards.length) return 1;
    const cardWidth = kitCards[0].getBoundingClientRect().width;
    const gap = getKitGap();
    if (!cardWidth) return 1;
    return Math.max(1, Math.floor((kitsSlider.clientWidth + gap) / (cardWidth + gap)));
  }

  function getMaxKitIndex() {
    return Math.max(0, kitCards.length - getVisibleKitCount());
  }

  function updateKitControls() {
    const maxIndex = getMaxKitIndex();
    if (kitsPrev) kitsPrev.disabled = kitIndex <= 0 || maxIndex === 0;
    if (kitsNext) kitsNext.disabled = kitIndex >= maxIndex || maxIndex === 0;
  }

  function showKit(index, animate = true) {
    if (!kitsTrack || !kitCards.length) return;

    const maxIndex = getMaxKitIndex();
    kitIndex = Math.min(Math.max(index, 0), maxIndex);

    const cardWidth = kitCards[0].getBoundingClientRect().width;
    const gap = getKitGap();
    const offset = kitIndex * (cardWidth + gap);

    if (!animate || reduceMotion) kitsTrack.style.transition = "none";
    else kitsTrack.style.removeProperty("transition");

    kitsTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;
    updateKitControls();

    if (!animate || reduceMotion) {
      window.requestAnimationFrame(() => kitsTrack.style.removeProperty("transition"));
    }
  }

  if (kitsSlider && kitsTrack && kitCards.length) {
    kitsSlider.setAttribute("tabindex", "0");
    kitsSlider.setAttribute("aria-label", "Kits digitales");

    kitsPrev?.addEventListener("click", () => showKit(kitIndex - 1));
    kitsNext?.addEventListener("click", () => showKit(kitIndex + 1));

    kitsSlider.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showKit(kitIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showKit(kitIndex + 1);
      }
    });

    kitsSlider.addEventListener("touchstart", (event) => {
      kitTouchStartX = event.changedTouches[0].clientX;
    }, { passive: true });

    kitsSlider.addEventListener("touchend", (event) => {
      const difference = event.changedTouches[0].clientX - kitTouchStartX;
      if (Math.abs(difference) > 45) {
        showKit(kitIndex + (difference < 0 ? 1 : -1));
      }
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => showKit(kitIndex, false));
    }, { passive: true });

    showKit(0, false);
  }

  /* =========================================================
     RESALTADOS ANIMADOS — KITS + CONTACTO
  ========================================================= */
  const ideaHighlights = document.querySelectorAll(".idea-highlight");

  if (ideaHighlights.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      ideaHighlights.forEach((highlight) => highlight.classList.add("is-selected"));
    } else {
      const ideaObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-selected");
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.55
      });

      ideaHighlights.forEach((highlight) => ideaObserver.observe(highlight));
    }
  }

});
