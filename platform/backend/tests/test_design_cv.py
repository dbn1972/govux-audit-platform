"""Deterministic CV design score (in the score path — must be reproducible)."""
from io import BytesIO
from app.services import design_cv


def _png(draw_fn, w=400, h=300):
    from PIL import Image
    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw_fn(img)
    buf = BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def test_assess_pure_bounds():
    for sig in [{}, {"palette": 50, "bg_share": 0.1, "edge": 40, "balance": 5},
                {"palette": 8, "bg_share": 0.6, "edge": 6, "balance": 1.0}]:
        s = design_cv.assess(sig)
        assert 0.0 <= s <= 100.0


def test_clean_scores_higher_than_cluttered():
    from PIL import ImageDraw
    def clean(img):
        d = ImageDraw.Draw(img)
        d.rectangle([40, 40, 360, 90], fill=(20, 60, 120))     # a header
        d.rectangle([40, 130, 200, 260], fill=(230, 235, 240))  # a card
    def cluttered(img):
        import random
        rng = random.Random(0)
        px = img.load()
        for x in range(img.width):
            for y in range(img.height):
                px[x, y] = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255))
    clean_score = design_cv.score_image(_png(clean))["score"]
    clutter_score = design_cv.score_image(_png(cluttered))["score"]
    assert clean_score > clutter_score
    assert 0 <= clutter_score <= 100 and 0 <= clean_score <= 100


def test_deterministic():
    from PIL import ImageDraw
    png = _png(lambda im: ImageDraw.Draw(im).rectangle([10, 10, 100, 100], fill=(0, 0, 0)))
    assert design_cv.score_image(png)["score"] == design_cv.score_image(png)["score"]


def test_score_from_path(tmp_path):
    from PIL import Image
    assert design_cv.score_from_path(str(tmp_path / "nope.jpg")) is None
    p = tmp_path / "s.png"; Image.new("RGB", (100, 80), (255, 255, 255)).save(p)
    assert design_cv.score_from_path(str(p)) is not None
