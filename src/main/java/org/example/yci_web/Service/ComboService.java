package org.example.yci_web.Service;

import org.example.yci_web.Model.Request.ComboRequest;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;

public interface ComboService {
    DataResponse getAllCombos();
    Object getComboById(Long idCombo);
    MessageResponse addCombo(ComboRequest comboRequest);
    MessageResponse updateCombo(ComboRequest comboRequest);
    MessageResponse deleteCombo(Long idCombo);
    MessageResponse toggleComboActive(Long idCombo);
    MessageResponse deleteComboImage(Long idCombo, Long idComboImage);
}
