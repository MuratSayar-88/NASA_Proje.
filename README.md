# SPHEREx Sky Motion Lab

A browser-based prototype for exploring SPHEREx observations and catalog-based stellar motion.

## Run locally

Run `start-server.cmd`, then open `http://127.0.0.1:8765`. The local PowerShell server queries the IRSA SIA2 archive and proxies FITS cutouts. The built-in astronomy FAQ runs in the browser and needs no AI model, API key, or external service.

## Features

- Search observations by sky coordinates, field of view, and SPHEREx detector (D1-D6)
- Load FITS cutouts ordered by observation time and browse them on a timeline
- Compare frames using playback, overlays, or frame differences
- Load 2D FITS `IMAGE` extensions or PNG/JPEG images
- View a real SPHEREx DR1/D3 FITS cutout of WISE 0855 as a local sample
- Explore the featured targets: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis
- Get instant answers to common questions about astronomy, SPHEREx, infrared observations, stellar motion, and the selected target
- Share coordinates, field of view, and detector through the URL
- Use a loopback-only PowerShell proxy for IRSA requests and approved IRSA SPHEREx FITS URLs

## Data and limitations

The archive uses IRSA SIA2 (`spherex_dr1`, `spherex_qr3`) and IRSA IBE cutout URLs. The local WISE 0855 sample is stored at `data/wise0855-d3-cutout.fits`.

The FAQ assistant uses a small set of reviewed, built-in answers; it does not generate open-ended responses. Answers are produced locally in the browser without loading a language model, so the assistant requires no additional model memory or network connection.

The one-year catalog-motion preview is a visualization, not an actual sequence of SPHEREx observations. Real archive frames show their recorded observation dates.

When archive images are unavailable, the viewer shows a representative background and a target path calculated from catalog proper motion. The catalog-motion preview covers one relative year; it is separate from SPHEREx's mission timeline and is not an observation date. The background is not a SPHEREx image.

FITS images are displayed with a linear min-max stretch. WCS-based alignment and photometric calibration are not performed. Overlay and difference modes are exploratory and are not intended for scientific measurements. SPHEREx archive coverage can vary by location and is updated over time.

## References

1. NASA. “SPHEREx Mission.” https://science.nasa.gov/mission/spherex/
2. NASA/IPAC Infrared Science Archive (IRSA). “SPHEREx Data Release 1 Overview.” https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html. DR1 Spectral Images DOI: https://doi.org/10.26131/IRSA678
3. IRSA. “SPHEREx Quick Release Overview.” https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html. QR3 DOI: https://doi.org/10.26131/IRSA662
4. IRSA. “Simple Image Access v2 Queries.” https://irsa.ipac.caltech.edu/ibe/sia.html
5. European Space Agency, Gaia Data Processing and Analysis Consortium. “Gaia Data Release 3.” https://www.cosmos.esa.int/web/gaia/data-release-3
6. NASA Goddard Space Flight Center. “FITS Standard Document.” https://fits.gsfc.nasa.gov/fits_standard.html
Accessed November 15, 2026. Archive products and documentation may be updated.

## About us

We are a group of space enthusiasts studying at Uğur Schools in Edremit, Türkiye. We created SPHEREx Sky Motion Lab to make exploring the changing sky more accessible and engaging.
