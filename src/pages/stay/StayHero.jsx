import { shortPrice } from './useStayEffects'

/**
 * Hero на цял екран: корицата, мек тъмен градиент, голямо заглавие, цена и
 * „Провери дати“. Корицата е <img> (не CSS фон) — с размери и приоритет, за да
 * е най-ранният и най-стабилен елемент при зареждане. Без снимки — богат
 * градиент от акцентния цвят, не празен блок.
 */
export default function StayHero({
  property,
  hero,
  photoCount,
  facts,
  basePrice,
  lang,
  canToggleLang,
  onToggleLang,
  onOpenGallery,
  onCheckDates,
}) {
  const srcSet = hero?.thumb && hero.thumb !== hero.url ? `${hero.thumb} 768w, ${hero.url} 1600w` : undefined

  return (
    <header className="stay-hero">
      {hero ? (
        <img
          className="stay-hero__media"
          src={hero.url}
          srcSet={srcSet}
          sizes="100vw"
          width="1600"
          height="1067"
          alt={property.name}
          fetchpriority="high"
          decoding="async"
        />
      ) : (
        <div className="stay-hero__fallback" aria-hidden="true" />
      )}
      <div className="stay-hero__shade" aria-hidden="true" />

      <div className="stay-hero__top">
        {photoCount > 0 ? (
          <button type="button" className="stay-pill" onClick={onOpenGallery}>
            {photoCount} {photoCount === 1 ? 'снимка' : 'снимки'}
          </button>
        ) : (
          <span />
        )}
        {canToggleLang && (
          <button
            type="button"
            className="stay-pill"
            onClick={onToggleLang}
            aria-label={lang === 'bg' ? 'Покажи описанието на английски' : 'Покажи описанието на български'}
          >
            <b className={lang === 'bg' ? '' : 'stay-pill__off'}>BG</b>
            {' · '}
            <b className={lang === 'en' ? '' : 'stay-pill__off'}>EN</b>
          </button>
        )}
      </div>

      <div className="stay-hero__content">
        <div className="stay-hero__copy">
          {property.city && (
            <p className="stay-hero__city" style={{ '--i': 0 }}>
              {property.city}
            </p>
          )}
          <h1 className="stay-hero__title" style={{ '--i': 1 }}>
            {property.name}
          </h1>
          <p className="stay-hero__facts" style={{ '--i': 2 }}>
            <span className="stay-hero__facts-in">
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </span>
          </p>
          <div className="stay-hero__row" style={{ '--i': 3 }}>
            {basePrice > 0 ? (
              <p className="stay-hero__price">
                <small>от</small>
                <b>{shortPrice(basePrice)}</b>
                <i>/ нощувка</i>
              </p>
            ) : (
              <span />
            )}
            <button type="button" className="stay-btn" onClick={onCheckDates}>
              Провери дати
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
