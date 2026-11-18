package org.example.yci_web.Controller;

import org.example.yci_web.Model.Request.ComboRequest;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Service.ComboService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class ComboController {

    @Autowired
    private ComboService comboService;

    // ── Public ──────────────────────────────────────────────────────────

    @GetMapping("/api/combo")
    public ResponseEntity<Object> getAllCombos() {
        return new ResponseEntity<>(comboService.getAllCombos(), HttpStatus.OK);
    }

    @GetMapping("/api/combo/{idCombo}")
    public ResponseEntity<Object> getComboById(@PathVariable Long idCombo) {
        Object result = comboService.getComboById(idCombo);
        if (result instanceof MessageResponse mr) {
            return new ResponseEntity<>(mr, mr.getStatus());
        }
        return new ResponseEntity<>(result, HttpStatus.OK);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    @PostMapping("/api/admin/combo")
    public ResponseEntity<Object> addCombo(@ModelAttribute ComboRequest comboRequest) {
        MessageResponse mr = comboService.addCombo(comboRequest);
        return new ResponseEntity<>(mr, mr.getStatus());
    }

    @PutMapping("/api/admin/combo")
    public ResponseEntity<Object> updateCombo(@ModelAttribute ComboRequest comboRequest) {
        MessageResponse mr = comboService.updateCombo(comboRequest);
        return new ResponseEntity<>(mr, mr.getStatus());
    }

    @DeleteMapping("/api/admin/combo/{idCombo}")
    public ResponseEntity<Object> deleteCombo(@PathVariable Long idCombo) {
        MessageResponse mr = comboService.deleteCombo(idCombo);
        return new ResponseEntity<>(mr, mr.getStatus());
    }

    @PutMapping("/api/admin/combo/toggle-active")
    public ResponseEntity<Object> toggleActive(@RequestBody Map<String, Long> body) {
        Long idCombo = body.get("idCombo");
        if (idCombo == null) {
            return new ResponseEntity<>(new MessageResponse("Thiếu idCombo", HttpStatus.BAD_REQUEST),
                                        HttpStatus.BAD_REQUEST);
        }
        MessageResponse mr = comboService.toggleComboActive(idCombo);
        return new ResponseEntity<>(mr, mr.getStatus());
    }

    @DeleteMapping("/api/admin/combo/{idCombo}/image/{idComboImage}")
    public ResponseEntity<Object> deleteComboImage(@PathVariable Long idCombo,
                                                   @PathVariable Long idComboImage) {
        MessageResponse mr = comboService.deleteComboImage(idCombo, idComboImage);
        return new ResponseEntity<>(mr, mr.getStatus());
    }
}
