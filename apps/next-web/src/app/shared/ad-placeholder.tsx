import styles from './ad-placeholder.module.css'

/** Layout preview only: no ad scripts, tracking, links or network requests. */
export function AdPlaceholder({ placement, position = 'middle', shape = 'banner' }: {
  placement: 'home' | 'catalog' | 'detail' | 'profile' | 'watch'
  position?: 'early' | 'middle' | 'late'
  shape?: 'banner' | 'rectangle'
}) {
  return (
    <aside aria-label="Advertisement placement preview" className={styles.slot} data-ad-placeholder={placement} data-ad-position={position}>
      <div className={`${styles.content} ${shape === 'rectangle' ? styles.rectangle : styles.banner}`}>
        <p className={styles.label}>Advertisement <span>· Preview</span></p>
        <div className={styles.frame}>
          <span className={styles.name}>Ad space</span>
          <span className={styles.dimensions} aria-hidden="true" />
        </div>
      </div>
    </aside>
  )
}
