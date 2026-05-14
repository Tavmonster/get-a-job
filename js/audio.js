/**
 * audio.js — Background music manager
 *
 * Usage:
 *   MusicManager.init(scene)   — call once during scene setup
 *   MusicManager.play()        — begin (or resume) looping music
 *   MusicManager.stop()        — stop the music
 *   MusicManager.setVolume(v)  — 0.0–1.0
 */
const MusicManager = (() => {
    let _sound = null;
    let _wantPlay = false;

    function init(scene) {
        _sound = new BABYLON.Sound("bgMusic", "audio/music.wav", scene, null, {
            loop: true,
            autoplay: false,
            volume: 0.4,
        });

        // Browser autoplay policy: audio context starts suspended until the
        // first user gesture. Hook the engine's unlock event so we can start
        // playback as soon as the context is allowed.
        const engineAE = scene.getEngine().audioEngine || BABYLON.Engine.audioEngine;
        if (engineAE && engineAE.onAudioUnlockedObservable) {
            engineAE.onAudioUnlockedObservable.addOnce(() => {
                if (_wantPlay && _sound && !_sound.isPlaying) _sound.play();
            });
        }
    }

    function play() {
        if (!_sound) return;
        _wantPlay = true;
        if (!_sound.isPlaying) _sound.play();
    }

    function stop() {
        if (!_sound) return;
        _wantPlay = false;
        if (_sound.isPlaying) _sound.stop();
    }

    function setVolume(v) {
        if (_sound) _sound.setVolume(v);
    }

    return { init, play, stop, setVolume };
})();
