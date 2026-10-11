package com.balmer.aprende;
import org.junit.Test;
import static org.junit.Assert.*;
public class AppUpdaterTest {
    @Test public void comparesSemanticVersionsWithoutLexicographicErrors() {
        assertTrue(AppUpdater.isNewer("v0.4.2","0.4.1"));
        assertTrue(AppUpdater.isNewer("v0.10.0","0.9.9"));
        assertFalse(AppUpdater.isNewer("v0.4.2","0.4.2"));
        assertFalse(AppUpdater.isNewer("v0.4.1","0.4.2"));
        assertFalse(AppUpdater.isNewer("v0.4.3-beta","0.4.2"));
        assertFalse(AppUpdater.isNewer("invalid","0.4.2"));
    }
}
