package org.example.yci_web.Model.Request;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class AdminCreateUserRequest {
    private String fullName;
    private String phone;
    private String password;
    private String email;
    private String address;
    private Integer role; // 0=admin, 1=customer, 2=staff
}
